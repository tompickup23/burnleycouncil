import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MyArea from './MyArea'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('../utils/strategyEngine', () => ({
  generateHousingTalkingPoints: vi.fn(() => []),
  generateHealthTalkingPoints: vi.fn(() => []),
  generateEconomyTalkingPoints: vi.fn(() => []),
  generateCrimeTalkingPoints: vi.fn(() => []),
  generateFiscalTalkingPoints: vi.fn(() => []),
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { generateHousingTalkingPoints, generateHealthTalkingPoints, generateEconomyTalkingPoints, generateCrimeTalkingPoints, generateFiscalTalkingPoints } from '../utils/strategyEngine'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
}

const mockWards = {
  'ward-1': { name: 'Cliviger with Worsthorne', color: '#dc241f', parties: ['Labour'] },
  'ward-2': { name: 'Brunshaw', color: '#0087dc', parties: ['Conservative'] },
  'ward-3': { name: 'Daneshouse', color: '#dc241f', parties: ['Labour', 'Labour'] },
}

const mockCouncillors = [
  { id: 'c1', name: 'Alice Smith', ward: 'Cliviger with Worsthorne', party: 'Labour', party_color: '#dc241f', email: 'alice@burnley.gov.uk', phone: '01onal', roles: ['Executive Member'] },
  { id: 'c2', name: 'Bob Jones', ward: 'Brunshaw', party: 'Conservative', party_color: '#0087dc', email: 'bob@burnley.gov.uk' },
  { id: 'c3', name: 'Carol Lee', ward: 'Daneshouse', party: 'Labour', party_color: '#dc241f' },
  { id: 'c4', name: 'Dave Brown', ward: 'Daneshouse', party: 'Labour', party_color: '#dc241f' },
]

const mockDeprivation = {
  wards: {
    'Cliviger with Worsthorne': {
      deprivation_level: 'Low',
      avg_imd_score: 12.5,
      avg_imd_decile: 7,
      national_percentile: 65,
      lsoa_count: 4,
    },
    'Daneshouse': {
      deprivation_level: 'Very High',
      avg_imd_score: 55.2,
      avg_imd_decile: 1,
      national_percentile: 5,
      lsoa_count: 6,
    },
  },
}

const mockPlanning = {
  meta: { years_back: 3 },
  summary: {
    total: 500,
    by_ward: { 'Daneshouse': 120, 'Brunshaw': 45, 'Cliviger with Worsthorne': 15 },
    approval_rate: 0.88,
    avg_decision_days: 52,
    decided_count: 420,
  },
  efficiency: { cost_per_application: 771, budget_year: '2024-25', apps_per_year: 167 },
  applications: [
    { uid: 'p1', ward: 'Daneshouse', description: 'Rear extension', state: 'Approved', start_date: '2025-01-10', address: '12 Colne Rd' },
    { uid: 'p2', ward: 'Daneshouse', description: 'Change of use to HMO', state: 'Refused', start_date: '2025-02-05', address: '8 Smith St' },
  ],
}

function setupMocks(overrides = {}, deprivation = mockDeprivation, planning = null, hmo = null) {
  useCouncilConfig.mockReturnValue(mockConfig)
  useData.mockImplementation((urls) => {
    if (Array.isArray(urls)) {
      // Primary data: wards + councillors + integrity
      return {
        data: overrides.data !== undefined ? overrides.data : [mockWards, mockCouncillors, null],
        loading: overrides.loading || false,
        error: overrides.error || null,
      }
    }
    // URL-specific optional data
    if (urls === '/data/planning.json') {
      return { data: planning, loading: false, error: planning ? null : new Error('Not found') }
    }
    if (urls === '/data/hmo.json') {
      return { data: hmo, loading: false, error: hmo ? null : new Error('Not found') }
    }
    if (urls === '/data/property_assets.json') {
      return { data: null, loading: false, error: new Error('Not found') }
    }
    if (urls === '/data/housing.json' || urls === '/data/health.json' || urls === '/data/economy.json') {
      return { data: null, loading: false, error: null }
    }
    if (urls === '/data/ward_boundaries.json' || urls === null) {
      return { data: null, loading: false, error: null }
    }
    // Default: deprivation
    return { data: deprivation, loading: false, error: deprivation ? null : new Error('Not found') }
  })
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <MyArea />
    </MemoryRouter>
  )
}

describe('MyArea', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    global.fetch = vi.fn()
    // jsdom doesn't implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()
    // Ensure strategy mocks return empty arrays after restoreAllMocks
    generateHousingTalkingPoints.mockReturnValue([])
    generateHealthTalkingPoints.mockReturnValue([])
    generateEconomyTalkingPoints.mockReturnValue([])
    generateCrimeTalkingPoints.mockReturnValue([])
    generateFiscalTalkingPoints.mockReturnValue([])
  })

  // === Loading / Error / Basic ===
  it('shows loading state while data loads', () => {
    useCouncilConfig.mockReturnValue(mockConfig)
    useData.mockImplementation((urls) => {
      if (Array.isArray(urls)) return { data: null, loading: true, error: null }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/loading ward data/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useCouncilConfig.mockReturnValue(mockConfig)
    useData.mockImplementation((urls) => {
      if (Array.isArray(urls)) return { data: null, loading: false, error: new Error('fail') }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
  })

  it('renders the page heading with data', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('My Area')).toBeInTheDocument()
  })

  it('renders postcode input', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByLabelText(/enter your postcode/i)).toBeInTheDocument()
  })

  // === Ward Grid ===
  it('renders all wards in the grid', () => {
    setupMocks()
    renderComponent()
    // Ward names appear in both dropdown options AND ward card grid
    expect(screen.getAllByText('Cliviger with Worsthorne').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Brunshaw').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Daneshouse').length).toBeGreaterThanOrEqual(1)
    // Verify ward cards specifically exist
    const wardCards = document.querySelectorAll('.ward-card')
    expect(wardCards.length).toBe(3)
  })

  it('renders ward cards sorted alphabetically', () => {
    setupMocks()
    renderComponent()
    const headings = screen.getAllByRole('button').filter(b => b.classList.contains('ward-card'))
    const names = headings.map(h => h.querySelector('h3')?.textContent)
    expect(names).toEqual(['Brunshaw', 'Cliviger with Worsthorne', 'Daneshouse'])
  })

  it('renders councillor names inside ward cards', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('Bob Jones')).toBeInTheDocument()
  })

  it('renders deprivation badges on ward cards', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Low deprivation')).toBeInTheDocument()
    expect(screen.getByText('Very High deprivation')).toBeInTheDocument()
  })

  it('renders party names on ward cards', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Conservative')).toBeInTheDocument()
  })

  // === Ward Selection ===
  it('selects a ward when clicking a ward card', () => {
    setupMocks()
    renderComponent()
    const wardCards = screen.getAllByRole('button').filter(b => b.classList.contains('ward-card'))
    fireEvent.click(wardCards[1])
    expect(screen.getByText('Your local councillors')).toBeInTheDocument()
  })

  it('selects ward via keyboard Enter', () => {
    setupMocks()
    renderComponent()
    const wardCards = screen.getAllByRole('button').filter(b => b.classList.contains('ward-card'))
    fireEvent.keyDown(wardCards[0], { key: 'Enter' })
    expect(screen.getByText('Your local councillors')).toBeInTheDocument()
  })

  it('selects ward via keyboard Space', () => {
    setupMocks()
    renderComponent()
    const wardCards = screen.getAllByRole('button').filter(b => b.classList.contains('ward-card'))
    fireEvent.keyDown(wardCards[0], { key: ' ' })
    expect(screen.getByText('Your local councillors')).toBeInTheDocument()
  })

  it('highlights selected ward card with aria-pressed', () => {
    setupMocks()
    renderComponent()
    const wardCards = screen.getAllByRole('button').filter(b => b.classList.contains('ward-card'))
    fireEvent.click(wardCards[0])
    expect(wardCards[0]).toHaveAttribute('aria-pressed', 'true')
  })

  // === Ward Dropdown ===
  it('renders ward dropdown selector', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByLabelText(/select your ward/i)).toBeInTheDocument()
  })

  it('selects ward from dropdown', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Brunshaw' } })
    expect(screen.getByText('Your local councillors')).toBeInTheDocument()
  })

  // === Ward Detail Panel ===
  it('shows councillor party badge when ward is selected', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Cliviger with Worsthorne' } })
    // 'Labour' appears in ward cards AND in the detail panel's party badge
    const labourElements = screen.getAllByText('Labour')
    expect(labourElements.length).toBeGreaterThanOrEqual(1)
    // Verify the party badge specifically exists in the detail panel
    const partyBadge = document.querySelector('.ward-details .party-badge')
    expect(partyBadge).toBeTruthy()
    expect(partyBadge.textContent).toBe('Labour')
  })

  it('shows councillor email as link when ward is selected', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Cliviger with Worsthorne' } })
    expect(screen.getByText('alice@burnley.gov.uk')).toBeInTheDocument()
  })

  it('shows councillor roles when ward is selected', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Cliviger with Worsthorne' } })
    expect(screen.getByText('Executive Member')).toBeInTheDocument()
  })

  it('shows deprivation data when ward with deprivation is selected', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Cliviger with Worsthorne' } })
    expect(screen.getByText('Deprivation Index')).toBeInTheDocument()
    expect(screen.getByText('12.5')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('65%')).toBeInTheDocument()
  })

  it('does not show deprivation panel when ward has no deprivation data', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Brunshaw' } })
    expect(screen.queryByText('Deprivation Index')).not.toBeInTheDocument()
  })

  it('shows multiple councillors for multi-member wards', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Daneshouse' } })
    // Names appear in ward card AND in the detail panel
    expect(screen.getAllByText('Carol Lee').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Dave Brown').length).toBeGreaterThanOrEqual(1)
    // Verify specifically that the detail panel has 2 councillor cards
    const detailCards = document.querySelectorAll('.ward-details .councillor-detail-card')
    expect(detailCards.length).toBe(2)
  })

  // === Postcode Lookup ===
  it('shows error for too-short postcode', async () => {
    setupMocks()
    renderComponent()
    const input = screen.getByLabelText(/enter your postcode/i)
    fireEvent.change(input, { target: { value: 'BB1' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText(/please enter a valid postcode/i)).toBeInTheDocument()
    })
  })

  it('shows success message when postcode found in correct district', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: 200,
        result: {
          postcode: 'BB11 3DF',
          admin_ward: 'Cliviger with Worsthorne',
          admin_district: 'Burnley',
        },
      }),
    })
    renderComponent()
    const input = screen.getByLabelText(/enter your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11 3DF' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      // Success message shows postcode and ward in .postcode-message
      const successMsg = document.querySelector('.postcode-message.success')
      expect(successMsg).toBeTruthy()
      expect(successMsg.textContent).toContain('BB11 3DF')
      expect(successMsg.textContent).toContain('Cliviger with Worsthorne')
    })
  })

  it('shows error when postcode is in different district', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: 200,
        result: {
          postcode: 'PR1 1AA',
          admin_ward: 'City Centre',
          admin_district: 'Preston',
        },
      }),
    })
    renderComponent()
    const input = screen.getByLabelText(/enter your postcode/i)
    fireEvent.change(input, { target: { value: 'PR1 1AA' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText(/that postcode is in Preston, not Burnley/i)).toBeInTheDocument()
    })
  })

  it('shows error when postcode not found', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ status: 404, result: null }),
    })
    renderComponent()
    const input = screen.getByLabelText(/enter your postcode/i)
    fireEvent.change(input, { target: { value: 'ZZ99 9ZZ' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText(/postcode not found/i)).toBeInTheDocument()
    })
  })

  it('shows error when fetch fails', async () => {
    setupMocks()
    global.fetch.mockRejectedValueOnce(new Error('Network error'))
    renderComponent()
    const input = screen.getByLabelText(/enter your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11 3DF' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText(/unable to look up postcode/i)).toBeInTheDocument()
    })
  })

  it('shows noData message when ward not in dataset', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: 200,
        result: {
          postcode: 'BB11 9XX',
          admin_ward: 'Unknown Ward',
          admin_district: 'Burnley',
        },
      }),
    })
    renderComponent()
    const input = screen.getByLabelText(/enter your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11 9XX' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText(/Unknown Ward/)).toBeInTheDocument()
      expect(screen.getByText(/don't have detailed councillor data/i)).toBeInTheDocument()
    })
  })

  it('disables lookup button when input is empty', () => {
    setupMocks()
    renderComponent()
    const btn = screen.getByText('Look up')
    expect(btn).toBeDisabled()
  })

  it('enables lookup button when input has value', () => {
    setupMocks()
    renderComponent()
    const input = screen.getByLabelText(/enter your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11' } })
    const btn = screen.getByText('Look up')
    expect(btn).not.toBeDisabled()
  })

  // === Empty wards ===
  it('renders without crashing when wards is empty', () => {
    setupMocks({ data: [{}, []] }, null)
    renderComponent()
    expect(screen.getByText('My Area')).toBeInTheDocument()
    expect(screen.getByText('All Wards')).toBeInTheDocument()
  })

  // === Official link ===
  it('renders official council link', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('More Information')).toBeInTheDocument()
    expect(screen.getByText(/burnley.gov.uk/)).toBeInTheDocument()
  })

  // === Planning Data ===
  it('shows planning activity when ward with planning data is selected', () => {
    setupMocks({}, mockDeprivation, mockPlanning)
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Daneshouse' } })
    expect(screen.getByText('Planning Activity')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument() // ward apps count
    expect(screen.getByText(/24% of total/)).toBeInTheDocument()
    expect(screen.getByText('88%')).toBeInTheDocument() // approval rate
    expect(screen.getByText('52')).toBeInTheDocument() // avg decision days
  })

  it('shows recent planning applications in ward detail', () => {
    setupMocks({}, mockDeprivation, mockPlanning)
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Daneshouse' } })
    expect(screen.getByText('Rear extension')).toBeInTheDocument()
    expect(screen.getByText('Change of use to HMO')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Refused')).toBeInTheDocument()
  })

  it('shows planning app badges on ward cards when planning data available', () => {
    setupMocks({}, mockDeprivation, mockPlanning)
    renderComponent()
    expect(screen.getByText('120 planning apps')).toBeInTheDocument()
    expect(screen.getByText('45 planning apps')).toBeInTheDocument()
    expect(screen.getByText('15 planning apps')).toBeInTheDocument()
  })

  it('does not show planning section when no planning data', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Daneshouse' } })
    expect(screen.queryByText('Planning Activity')).not.toBeInTheDocument()
  })

  it('does not show planning section when ward has zero planning apps', () => {
    setupMocks({}, mockDeprivation, { ...mockPlanning, summary: { ...mockPlanning.summary, by_ward: { 'Other Ward': 100 } } })
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Daneshouse' } })
    expect(screen.queryByText('Planning Activity')).not.toBeInTheDocument()
  })

  // === HMO Data ===
  const mockHmo = {
    meta: { register_name: 'Test Council HMO Register', coverage: 'register+planning' },
    summary: {
      total_licensed: 100,
      total_planning_apps: 5,
      total_bed_spaces: 800,
      by_ward: {
        'Daneshouse': { licensed_hmos: 25, planning_applications: 2, total: 27, density_per_1000: 4.5, population: 6000 },
        'Brunshaw': { licensed_hmos: 3, planning_applications: 0, total: 3 },
      },
      top_ward: 'Daneshouse',
    },
  }

  it('shows HMO data when ward with HMO data is selected', () => {
    setupMocks({}, mockDeprivation, null, mockHmo)
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Daneshouse' } })
    expect(screen.getByText('Houses in Multiple Occupation')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()  // licensed count
    expect(screen.getByText('Licensed HMOs')).toBeInTheDocument()
  })

  it('shows HMO density when available', () => {
    setupMocks({}, mockDeprivation, null, mockHmo)
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Daneshouse' } })
    expect(screen.getByText('4.5')).toBeInTheDocument()
    expect(screen.getByText('HMOs per 1,000 pop')).toBeInTheDocument()
  })

  it('shows HMO badges on ward cards', () => {
    setupMocks({}, mockDeprivation, null, mockHmo)
    renderComponent()
    expect(screen.getByText('27 HMOs')).toBeInTheDocument()
    expect(screen.getByText('3 HMOs')).toBeInTheDocument()
  })

  it('does not show HMO section when no HMO data', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Daneshouse' } })
    expect(screen.queryByText('Houses in Multiple Occupation')).not.toBeInTheDocument()
  })

  it('does not show HMO section when ward has zero HMOs', () => {
    setupMocks({}, mockDeprivation, null, { ...mockHmo, summary: { ...mockHmo.summary, by_ward: { 'Other Ward': { total: 5 } } } })
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Daneshouse' } })
    expect(screen.queryByText('Houses in Multiple Occupation')).not.toBeInTheDocument()
  })

  // --- Ward Intelligence Briefing ---
  it('renders Ward Intelligence Briefing when talking points exist', () => {
    generateFiscalTalkingPoints.mockReturnValue([
      { category: 'Fiscal', icon: 'AlertTriangle', priority: 1, text: 'Fiscal resilience concern.' },
    ])
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Cliviger with Worsthorne' } })
    expect(screen.getByText('Ward Intelligence Briefing')).toBeInTheDocument()
    expect(screen.getByText('Fiscal resilience concern.')).toBeInTheDocument()
  })

  it('does not render Ward Intelligence Briefing when no talking points', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Cliviger with Worsthorne' } })
    expect(screen.queryByText('Ward Intelligence Briefing')).not.toBeInTheDocument()
  })

  it('calls multiple talking point generators for ward briefing', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Brunshaw' } })
    expect(generateHousingTalkingPoints).toHaveBeenCalled()
    expect(generateFiscalTalkingPoints).toHaveBeenCalled()
  })

  // --- Ward Hub Dashboard ---
  const mockConfigWithDS = {
    ...mockConfig,
    data_sources: {
      crime_stats: true,
      housing: true,
      health: true,
      economy: true,
      demographics: true,
      elections: true,
    },
  }

  const mockHousingData = {
    census: {
      wards: {
        'ward-code-1': {
          name: 'Cliviger with Worsthorne',
          tenure: { 'Owned': 800, 'Social rented': 100, 'Private rented': 100 },
        },
      },
    },
  }

  const mockHealthData = {
    summary: {
      life_expectancy_male: 78.2,
      life_expectancy_female: 82.1,
    },
    census: { wards: {} },
  }

  const mockEconomyData = {
    summary: { claimant_rate_pct: 4.2 },
    claimant_count: { wards: {} },
    census: { wards: {} },
  }

  function setupHubMocks() {
    useCouncilConfig.mockReturnValue(mockConfigWithDS)
    useData.mockImplementation((urls) => {
      if (Array.isArray(urls)) {
        return {
          data: [mockWards, mockCouncillors, null],
          loading: false,
          error: null,
        }
      }
      if (urls === '/data/deprivation.json') {
        return { data: mockDeprivation, loading: false, error: null }
      }
      if (urls === '/data/housing.json') {
        return { data: mockHousingData, loading: false, error: null }
      }
      if (urls === '/data/health.json') {
        return { data: mockHealthData, loading: false, error: null }
      }
      if (urls === '/data/economy.json') {
        return { data: mockEconomyData, loading: false, error: null }
      }
      if (urls === '/data/demographics.json') {
        return { data: { wards: { 'Cliviger with Worsthorne': { population: { total: 12340 } } } }, loading: false, error: null }
      }
      return { data: null, loading: false, error: null }
    })
  }

  it('renders ward hub dashboard cards when ward is selected with data sources', () => {
    setupHubMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Cliviger with Worsthorne' } })
    const dashboard = screen.getByTestId('ward-hub-dashboard')
    expect(dashboard).toBeInTheDocument()
    expect(screen.getByText(/Explore Cliviger with Worsthorne/)).toBeInTheDocument()
    // Should have cards for each data source
    expect(screen.getByTestId('hub-card-crime')).toBeInTheDocument()
    expect(screen.getByTestId('hub-card-housing')).toBeInTheDocument()
    expect(screen.getByTestId('hub-card-health')).toBeInTheDocument()
    expect(screen.getByTestId('hub-card-economy')).toBeInTheDocument()
    expect(screen.getByTestId('hub-card-elections')).toBeInTheDocument()
  })

  it('hub cards link to correct specialist pages', () => {
    setupHubMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Cliviger with Worsthorne' } })
    const crimeCard = screen.getByTestId('hub-card-crime')
    expect(crimeCard.closest('a')).toHaveAttribute('href', '/crime')
    const housingCard = screen.getByTestId('hub-card-housing')
    expect(housingCard.closest('a')).toHaveAttribute('href', '/housing')
    const healthCard = screen.getByTestId('hub-card-health')
    expect(healthCard.closest('a')).toHaveAttribute('href', '/health')
    const economyCard = screen.getByTestId('hub-card-economy')
    expect(economyCard.closest('a')).toHaveAttribute('href', '/economy')
  })

  it('hub cards show summary stats from loaded data', () => {
    setupHubMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Cliviger with Worsthorne' } })
    // Housing: 800 owned out of 1000 total = 80% owned
    expect(screen.getByText('80% owned')).toBeInTheDocument()
    // Health: life expectancy
    expect(screen.getByText('LE: 78.2M')).toBeInTheDocument()
    // Economy: claimant rate
    expect(screen.getByText('4.2% claimant')).toBeInTheDocument()
    // Demographics: population
    expect(screen.getByText('Pop: 12,340')).toBeInTheDocument()
    // Elections: party holder from wards data
    expect(screen.getByTestId('hub-card-elections')).toBeInTheDocument()
  })
})
