import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PropertyPortfolio from './PropertyPortfolio'

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
  LoadingState: () => <div>Loading...</div>,
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useAuth } from '../context/AuthContext'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockConfig = {
  council_id: 'lancashire_cc',
  council_name: 'Lancashire CC',
  council_full_name: 'Lancashire County Council',
  official_website: 'https://lancashire.gov.uk',
  spending_threshold: 500,
  data_sources: { property: true },
}

const mockPropertyData = {
  meta: {
    total_assets: 3,
    total_categories: 2,
    freehold: 3,
    land_only: 1,
    disposal_candidates: 1,
    has_ced: 3,
    category_breakdown: { office_civic: 1, library: 1, land_general: 1 },
    district_breakdown: { Preston: 1, Burnley: 1, Hyndburn: 1 },
    ced_summary: { 'Preston Central East': 1, 'Burnley Central East': 1, 'Accrington South': 1 },
    data_quality: { epc_match_rate: 71.4 },
  },
  assets: [
    {
      id: 'lcc-001',
      name: 'County Hall',
      address: 'PO Box 78, Preston',
      postcode: 'PR1 8XJ',
      ward: 'Preston Central',
      ced: 'Preston Central East',
      district: 'Preston',
      category: 'office_civic',
      ownership: 'freehold',
      land_only: false,
      active: true,
      lat: 53.7632,
      lng: -2.7051,
      epc_rating: 'C',
      linked_spend: 150000,
      sell_score: 20,
      keep_score: 85,
      colocate_score: 40,
      disposal: { category: 'E', priority: 10, confidence: 'high' },
      flags: [],
    },
    {
      id: 'lcc-002',
      name: 'Burnley Library',
      address: 'Grimshaw St, Burnley',
      postcode: 'BB11 2BD',
      ward: 'Burnley Central',
      ced: 'Burnley Central East',
      district: 'Burnley',
      category: 'library',
      ownership: 'freehold',
      land_only: false,
      active: true,
      lat: 53.7891,
      lng: -2.2467,
      epc_rating: 'D',
      linked_spend: 25000,
      sell_score: 60,
      keep_score: 45,
      colocate_score: 30,
      disposal: { category: 'B', priority: 72, confidence: 'medium' },
      flags: ['energy_risk'],
    },
    {
      id: 'lcc-003',
      name: 'Land at Whalley Road',
      address: 'Whalley Road, Accrington',
      postcode: 'BB5 1AS',
      ward: 'Huncoat',
      ced: 'Accrington South',
      district: 'Hyndburn',
      category: 'land_general',
      ownership: 'freehold',
      land_only: true,
      active: true,
      lat: 53.75,
      lng: -2.37,
      epc_rating: '',
      linked_spend: 0,
      sell_score: 80,
      keep_score: 15,
      colocate_score: 10,
      disposal: { category: 'A', priority: 88, confidence: 'high' },
      flags: ['high_deprivation'],
    },
  ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderComponent() {
  return render(
    <MemoryRouter>
      <PropertyPortfolio />
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PropertyPortfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
    useAuth.mockReturnValue({ isStrategist: true, isAdmin: false })
    useData.mockReturnValue({ data: mockPropertyData, loading: false, error: null })
    mockNavigate.mockReset()
  })

  // --- Loading / Error / Empty ---

  it('renders loading state', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders error state', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText('Failed to load property data.')).toBeInTheDocument()
  })

  it('renders empty state when no assets', () => {
    useData.mockReturnValue({ data: { meta: {}, assets: [] }, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('No Property Data')).toBeInTheDocument()
    expect(screen.getByText(/not yet available/)).toBeInTheDocument()
  })

  it('renders empty state when data is null', () => {
    useData.mockReturnValue({ data: null, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('No Property Data')).toBeInTheDocument()
  })

  // --- Auth gating ---

  it('shows access restricted when Firebase enabled and user is not strategist', async () => {
    // Dynamically change isFirebaseEnabled to true
    const firebaseMod = await import('../firebase')
    const originalValue = firebaseMod.isFirebaseEnabled
    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: true, writable: true })

    useAuth.mockReturnValue({ isStrategist: false, isAdmin: false })
    renderComponent()
    expect(screen.getByText('Access Restricted')).toBeInTheDocument()
    expect(screen.getByText(/strategist access/)).toBeInTheDocument()

    // Restore
    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: originalValue, writable: true })
  })

  it('allows access when Firebase is not enabled (dev mode)', () => {
    useAuth.mockReturnValue({ isStrategist: false, isAdmin: false })
    renderComponent()
    // Should NOT show restricted — isFirebaseEnabled is false
    expect(screen.queryByText('Access Restricted')).not.toBeInTheDocument()
    expect(screen.getByText('Property Estate')).toBeInTheDocument()
  })

  // --- Header ---

  it('renders page header with title and asset count', () => {
    renderComponent()
    expect(screen.getByText('Property Estate')).toBeInTheDocument()
    expect(screen.getByText(/3 council-owned assets/)).toBeInTheDocument()
  })

  // --- Stats grid ---

  it('renders stats grid with correct values', () => {
    renderComponent()
    expect(screen.getByText('Total Assets')).toBeInTheDocument()
    // "Freehold" appears both as a stat label and dropdown option — use getAllByText
    expect(screen.getAllByText('Freehold').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Land Only')).toBeInTheDocument()
    expect(screen.getByText('Disposal Candidates')).toBeInTheDocument()
    expect(screen.getByText('Assessed')).toBeInTheDocument()
    expect(screen.getByText('CEDs Mapped')).toBeInTheDocument()
  })

  it('calculates freehold percentage correctly', () => {
    renderComponent()
    // 3/3 = 100.0%
    expect(screen.getByText('100.0%')).toBeInTheDocument()
  })

  it('calculates land only percentage correctly', () => {
    renderComponent()
    // 1/3 = 33.3%
    expect(screen.getByText('33.3%')).toBeInTheDocument()
  })

  // --- Table rendering ---

  it('renders asset rows in the table', () => {
    renderComponent()
    expect(screen.getByText('County Hall')).toBeInTheDocument()
    expect(screen.getByText('Burnley Library')).toBeInTheDocument()
    expect(screen.getByText('Land at Whalley Road')).toBeInTheDocument()
  })

  it('renders postcodes in the table', () => {
    renderComponent()
    expect(screen.getByText('PR1 8XJ')).toBeInTheDocument()
    expect(screen.getByText('BB11 2BD')).toBeInTheDocument()
  })

  it('renders category badges correctly', () => {
    renderComponent()
    expect(screen.getAllByText('Office / Civic').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Library').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Land (General)').length).toBeGreaterThan(0)
  })

  it('renders disposal badges with correct labels', () => {
    renderComponent()
    // priority 10 = Low, priority 72 = Medium, priority 88 = High
    expect(screen.getByText('Low (10)')).toBeInTheDocument()
    expect(screen.getByText('Medium (72)')).toBeInTheDocument()
    expect(screen.getByText('High (88)')).toBeInTheDocument()
  })

  // --- Navigation ---

  it('navigates to property detail on row click', () => {
    renderComponent()
    fireEvent.click(screen.getByText('County Hall'))
    expect(mockNavigate).toHaveBeenCalledWith('/property/lcc-001')
  })

  it('navigates to correct property for each row', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Burnley Library'))
    expect(mockNavigate).toHaveBeenCalledWith('/property/lcc-002')
  })

  // --- Filtering ---

  it('filters assets by search text (name)', () => {
    renderComponent()
    const searchInput = screen.getByPlaceholderText('Search assets...')
    fireEvent.change(searchInput, { target: { value: 'County' } })
    expect(screen.getByText('County Hall')).toBeInTheDocument()
    expect(screen.queryByText('Burnley Library')).not.toBeInTheDocument()
    expect(screen.queryByText('Land at Whalley Road')).not.toBeInTheDocument()
  })

  it('filters assets by search text (postcode)', () => {
    renderComponent()
    const searchInput = screen.getByPlaceholderText('Search assets...')
    fireEvent.change(searchInput, { target: { value: 'BB11' } })
    expect(screen.queryByText('County Hall')).not.toBeInTheDocument()
    expect(screen.getByText('Burnley Library')).toBeInTheDocument()
  })

  it('filters assets by category dropdown', () => {
    renderComponent()
    const selects = screen.getAllByRole('combobox')
    // Category select is the first dropdown
    const categorySelect = selects.find(s => {
      const options = within(s).queryAllByRole('option')
      return options.some(o => o.textContent === 'All Categories')
    })
    fireEvent.change(categorySelect, { target: { value: 'library' } })
    expect(screen.getByText('Burnley Library')).toBeInTheDocument()
    expect(screen.queryByText('County Hall')).not.toBeInTheDocument()
  })

  it('shows filtered count when filters are active', () => {
    renderComponent()
    const searchInput = screen.getByPlaceholderText('Search assets...')
    fireEvent.change(searchInput, { target: { value: 'County' } })
    expect(screen.getByText(/1 asset found/)).toBeInTheDocument()
    expect(screen.getByText(/filtered from 3/)).toBeInTheDocument()
  })

  it('shows clear button when filters are active', () => {
    renderComponent()
    expect(screen.queryByText('Clear')).not.toBeInTheDocument()
    const searchInput = screen.getByPlaceholderText('Search assets...')
    fireEvent.change(searchInput, { target: { value: 'County' } })
    expect(screen.getByText('Clear')).toBeInTheDocument()
  })

  it('clears all filters on clear button click', () => {
    renderComponent()
    const searchInput = screen.getByPlaceholderText('Search assets...')
    fireEvent.change(searchInput, { target: { value: 'County' } })
    expect(screen.getByText(/1 asset found/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Clear'))
    expect(screen.getByText(/3 assets found/)).toBeInTheDocument()
  })

  it('shows no match message when filters exclude all assets', () => {
    renderComponent()
    const searchInput = screen.getByPlaceholderText('Search assets...')
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } })
    expect(screen.getByText('No assets match your filters.')).toBeInTheDocument()
  })

  // --- Sorting ---

  it('sorts by name ascending by default', () => {
    renderComponent()
    const rows = screen.getAllByRole('row').slice(1) // skip header row
    expect(rows[0]).toHaveTextContent('Burnley Library')
    expect(rows[1]).toHaveTextContent('County Hall')
    expect(rows[2]).toHaveTextContent('Land at Whalley Road')
  })

  it('toggles sort direction on column header click', () => {
    renderComponent()
    // Click Name header to toggle to desc
    const nameHeader = screen.getByText('Name')
    fireEvent.click(nameHeader)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Land at Whalley Road')
    expect(rows[2]).toHaveTextContent('Burnley Library')
  })

  it('sorts by sell score when sell score header clicked', () => {
    renderComponent()
    const sellHeader = screen.getByText('Sell Score')
    fireEvent.click(sellHeader)
    const rows = screen.getAllByRole('row').slice(1)
    // Ascending: 20, 60, 80
    expect(rows[0]).toHaveTextContent('County Hall')
    expect(rows[1]).toHaveTextContent('Burnley Library')
    expect(rows[2]).toHaveTextContent('Land at Whalley Road')
  })

  // --- Pagination ---

  it('does not show pagination when total is under PAGE_SIZE', () => {
    renderComponent()
    expect(screen.queryByText(/Page \d+ of/)).not.toBeInTheDocument()
  })

  it('shows pagination when total exceeds PAGE_SIZE (50)', () => {
    // Create 55 assets
    const manyAssets = Array.from({ length: 55 }, (_, i) => ({
      ...mockPropertyData.assets[0],
      id: `lcc-${String(i).padStart(3, '0')}`,
      name: `Asset ${String(i).padStart(3, '0')}`,
    }))
    useData.mockReturnValue({
      data: { ...mockPropertyData, assets: manyAssets },
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
  })

  it('navigates to next page on Next click', () => {
    const manyAssets = Array.from({ length: 55 }, (_, i) => ({
      ...mockPropertyData.assets[0],
      id: `lcc-${String(i).padStart(3, '0')}`,
      name: `Asset ${String(i).padStart(3, '0')}`,
    }))
    useData.mockReturnValue({
      data: { ...mockPropertyData, assets: manyAssets },
      loading: false,
      error: null,
    })
    renderComponent()
    fireEvent.click(screen.getByText(/Next/))
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
  })

  // --- CSV Export ---

  it('renders CSV export button', () => {
    renderComponent()
    expect(screen.getByText('Export CSV')).toBeInTheDocument()
  })

  it('triggers CSV export on button click', () => {
    // Render first, then mock createElement for the export only
    renderComponent()

    const mockCreateObjectURL = vi.fn(() => 'blob:test')
    const mockRevokeObjectURL = vi.fn()
    global.URL.createObjectURL = mockCreateObjectURL
    global.URL.revokeObjectURL = mockRevokeObjectURL

    const mockLink = { click: vi.fn(), href: '', download: '' }
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return mockLink
      return originalCreateElement(tag)
    })

    fireEvent.click(screen.getByText('Export CSV'))

    expect(mockCreateObjectURL).toHaveBeenCalled()
    expect(mockLink.click).toHaveBeenCalled()
    expect(mockRevokeObjectURL).toHaveBeenCalled()
    expect(mockLink.download).toMatch(/property_assets_lancashire_cc_/)

    document.createElement.mockRestore()
  })

  // --- View mode toggle ---

  it('renders table view by default', () => {
    renderComponent()
    expect(screen.getByText('County Hall')).toBeInTheDocument()
    expect(screen.queryByText('Interactive property map coming in Phase 4.')).not.toBeInTheDocument()
  })

  it('switches to map view on Map button click', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Map'))
    expect(screen.getByText('Map View')).toBeInTheDocument()
    expect(screen.getByText(/Interactive property map coming in Phase 4/)).toBeInTheDocument()
  })

  // --- Category breakdown ---

  it('renders category breakdown section', () => {
    renderComponent()
    expect(screen.getByText('Category Breakdown')).toBeInTheDocument()
  })

  // --- Result count ---

  it('shows correct result count', () => {
    renderComponent()
    expect(screen.getByText(/3 assets found/)).toBeInTheDocument()
  })

  // --- Sets document title ---

  it('sets document title on mount', () => {
    renderComponent()
    expect(document.title).toBe('Property Estate | Lancashire CC Transparency')
  })
})
