import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PropertyDetail from './PropertyDetail'

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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(),
  }
})

vi.mock('../components/ui', () => ({
  LoadingState: ({ message }) => <div>{message || 'Loading...'}</div>,
}))

vi.mock('./PropertyDetail.css', () => ({}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useAuth } from '../context/AuthContext'
import { useParams } from 'react-router-dom'

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

const baseAsset = {
  id: 'lcc-001',
  name: 'County Hall',
  address: 'PO Box 78, Preston',
  postcode: 'PR1 8XJ',
  ward: 'Preston Central',
  ced: 'Preston Central East',
  district: 'Preston',
  constituency: 'Preston',
  category: 'office_civic',
  ownership: 'Freehold',
  ownership_scope: 'land_and_building',
  land_only: false,
  active: true,
  lat: 53.7632,
  lng: -2.7051,
  epc_rating: 'C',
  floor_area_sqm: 5000,
  linked_spend: 150000,
  sell_score: 20,
  keep_score: 85,
  colocate_score: 40,
  primary_option: 'Retain',
  disposal: { category: 'E', priority: 10, confidence: 'high', recommendation: 'Retain', reasoning: 'Strategic headquarters.\nCore administrative function.', key_risks: 'High maintenance cost|Listed building constraints', next_steps: 'Commission condition survey|Review energy efficiency' },
  flags: ['listed_building'],
  google_maps_url: 'https://maps.google.com/?q=53.7632,-2.7051',
  deprivation: { imd_decile: 4, income_decile: 3, employment_decile: 5, education_decile: 6, health_decile: 4, crime_decile: 2, housing_decile: 7, living_env_decile: 5, imd_rank: 5000 },
  energy: { rating: 'C', potential_rating: 'B', property_type: 'Non-Domestic', floor_area_sqm: 5000, main_heating: 'Gas boiler', valid_until: '2028-06-15', match_status: 'exact', certificate_url: 'https://epc.example.com/cert/1234' },
  spending: { total: 150000, transactions: 45, unique_suppliers: 8, condition_spend: 12000, condition_samples: 'Roof repair, window sealing' },
  supplier_links: [
    { supplier: 'Supplier A', spend: 80000, transactions: 20 },
    { supplier: 'Supplier B', spend: 70000, transactions: 25 },
  ],
  co_location: { same_postcode: 2, nearby_500m: 5, nearby_1000m: 12, nearest_name: 'Preston Bus Station', nearest_distance_m: 350 },
  flood: { areas_1km: 3, areas_3km: 8, nearest_label: 'River Ribble Flood Zone', nearest_distance_km: 0.8 },
  crime: { total_1mi: 245, violent_1mi: 87, antisocial_1mi: 63, density_band: 'high', snapshot_month: '2025-12' },
}

const mockDetailData = {
  meta: { total_assets: 1 },
  assets: [baseAsset],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderComponent() {
  return render(
    <MemoryRouter>
      <PropertyDetail />
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PropertyDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
    useAuth.mockReturnValue({ isStrategist: true, isAdmin: false })
    useParams.mockReturnValue({ propertyId: 'lcc-001' })
    useData.mockReturnValue({ data: mockDetailData, loading: false, error: null })
  })

  // --- Loading / Error / Not Found ---

  it('renders loading state', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText('Loading property data...')).toBeInTheDocument()
  })

  it('renders error state with back link', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText('Error Loading Data')).toBeInTheDocument()
    expect(screen.getByText(/Could not load property data/)).toBeInTheDocument()
    expect(screen.getByText(/Back to Property Estate/)).toBeInTheDocument()
  })

  it('renders 404 state when property not found', () => {
    useParams.mockReturnValue({ propertyId: 'nonexistent' })
    renderComponent()
    expect(screen.getByText('Asset Not Found')).toBeInTheDocument()
    expect(screen.getByText(/nonexistent/)).toBeInTheDocument()
    expect(screen.getByText(/Back to Property Estate/)).toBeInTheDocument()
  })

  it('renders 404 when data has no matching asset', () => {
    useData.mockReturnValue({
      data: { meta: {}, assets: [{ id: 'other-001', name: 'Other' }] },
      loading: false,
      error: null,
    })
    useParams.mockReturnValue({ propertyId: 'lcc-001' })
    renderComponent()
    expect(screen.getByText('Asset Not Found')).toBeInTheDocument()
  })

  // --- Auth gating ---

  it('shows access restricted when Firebase enabled and user is not strategist', async () => {
    const firebaseMod = await import('../firebase')
    const originalValue = firebaseMod.isFirebaseEnabled
    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: true, writable: true })

    useAuth.mockReturnValue({ isStrategist: false, isAdmin: false })
    renderComponent()
    expect(screen.getByText('Access Restricted')).toBeInTheDocument()
    expect(screen.getByText(/strategist access/)).toBeInTheDocument()

    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: originalValue, writable: true })
  })

  it('allows access when Firebase is not enabled', () => {
    useAuth.mockReturnValue({ isStrategist: false, isAdmin: false })
    renderComponent()
    expect(screen.queryByText('Access Restricted')).not.toBeInTheDocument()
    expect(screen.getByText('County Hall')).toBeInTheDocument()
  })

  // --- Header ---

  it('renders header with property name', () => {
    renderComponent()
    expect(screen.getByText('County Hall')).toBeInTheDocument()
  })

  it('renders address and postcode in header', () => {
    renderComponent()
    expect(screen.getByText('PO Box 78, Preston')).toBeInTheDocument()
    expect(screen.getByText('PR1 8XJ')).toBeInTheDocument()
  })

  it('renders category badge in header', () => {
    renderComponent()
    expect(screen.getAllByText('Office / Civic').length).toBeGreaterThan(0)
  })

  it('renders ownership badge', () => {
    renderComponent()
    expect(screen.getAllByText(/freehold/i).length).toBeGreaterThan(0)
  })

  it('renders EPC badge', () => {
    renderComponent()
    expect(screen.getByText('EPC C')).toBeInTheDocument()
  })

  it('renders active/inactive badge', () => {
    renderComponent()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  // --- Score cards ---

  it('renders score cards with correct values', () => {
    renderComponent()
    expect(screen.getByText('Sell Score')).toBeInTheDocument()
    expect(screen.getByText('Keep Score')).toBeInTheDocument()
    expect(screen.getByText('Co-locate Score')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('85')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
  })

  // --- Back link ---

  it('renders back to portfolio link', () => {
    renderComponent()
    const backLinks = screen.getAllByText(/Back to Property Estate/)
    expect(backLinks.length).toBeGreaterThanOrEqual(1)
  })

  // --- Overview tab (default) ---

  it('renders overview tab by default', () => {
    renderComponent()
    expect(screen.getByText('Property Details')).toBeInTheDocument()
    expect(screen.getByText('No')).toBeInTheDocument() // Land Only: No
  })

  it('renders deprivation context in overview', () => {
    renderComponent()
    expect(screen.getByText('Deprivation Context')).toBeInTheDocument()
    expect(screen.getByText('Overall IMD')).toBeInTheDocument()
    // Decile is rendered as "4/10" by DeprivationBar
    expect(screen.getAllByText(/4\/10/).length).toBeGreaterThan(0)
  })

  it('renders flags in overview', () => {
    renderComponent()
    expect(screen.getByText('listed building')).toBeInTheDocument()
  })

  it('renders ward context link', () => {
    renderComponent()
    expect(screen.getByText(/View Preston Central on My Area page/)).toBeInTheDocument()
  })

  // --- Tab switching ---

  it('switches to financials tab', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Financials'))
    expect(screen.getByText('Linked Spending')).toBeInTheDocument()
  })

  it('switches to energy tab', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Energy'))
    expect(screen.getByText('Energy Performance Certificate')).toBeInTheDocument()
  })

  it('switches to disposal tab', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Disposal'))
    expect(screen.getByText('Disposal Assessment')).toBeInTheDocument()
  })

  it('switches to location tab', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Location'))
    expect(screen.getByText('Administrative Geography')).toBeInTheDocument()
  })

  // --- Financials tab ---

  it('shows supplier breakdown in financials', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Financials'))
    expect(screen.getByText('Supplier Breakdown')).toBeInTheDocument()
    expect(screen.getByText('Supplier A')).toBeInTheDocument()
    expect(screen.getByText('Supplier B')).toBeInTheDocument()
  })

  it('shows no spending message when no data', () => {
    const assetNoSpending = { ...baseAsset, spending: { total: 0 }, supplier_links: [] }
    useData.mockReturnValue({ data: { meta: {}, assets: [assetNoSpending] }, loading: false, error: null })
    renderComponent()
    fireEvent.click(screen.getByText('Financials'))
    expect(screen.getByText(/No spending data linked/)).toBeInTheDocument()
  })

  // --- Energy tab ---

  it('shows EPC ratings in energy tab', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Energy'))
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.getByText('Potential')).toBeInTheDocument()
    expect(screen.getByText('Gas boiler')).toBeInTheDocument()
  })

  it('shows no EPC message when energy data is missing', () => {
    const assetNoEnergy = { ...baseAsset, energy: null }
    useData.mockReturnValue({ data: { meta: {}, assets: [assetNoEnergy] }, loading: false, error: null })
    renderComponent()
    fireEvent.click(screen.getByText('Energy'))
    expect(screen.getByText(/No EPC data available/)).toBeInTheDocument()
  })

  // --- Disposal tab ---

  it('shows disposal recommendation and reasoning', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Disposal'))
    expect(screen.getAllByText(/Retain/).length).toBeGreaterThan(0)
    expect(screen.getByText('high confidence')).toBeInTheDocument()
    expect(screen.getByText('Reasoning')).toBeInTheDocument()
    expect(screen.getByText('Strategic headquarters.')).toBeInTheDocument()
  })

  it('shows key risks in disposal tab', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Disposal'))
    expect(screen.getByText('Key Risks')).toBeInTheDocument()
    expect(screen.getByText('High maintenance cost')).toBeInTheDocument()
    expect(screen.getByText('Listed building constraints')).toBeInTheDocument()
  })

  it('shows next steps in disposal tab', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Disposal'))
    expect(screen.getByText('Next Steps')).toBeInTheDocument()
    expect(screen.getByText('Commission condition survey')).toBeInTheDocument()
  })

  it('shows not flagged message when no disposal recommendation', () => {
    const assetNoDisposal = { ...baseAsset, disposal: {} }
    useData.mockReturnValue({ data: { meta: {}, assets: [assetNoDisposal] }, loading: false, error: null })
    renderComponent()
    fireEvent.click(screen.getByText('Disposal'))
    expect(screen.getByText(/Not flagged for disposal/)).toBeInTheDocument()
  })

  // --- Location tab ---

  it('shows geography details in location tab', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Location'))
    expect(screen.getAllByText(/Preston/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Preston Central East/).length).toBeGreaterThan(0)
  })

  it('shows co-location analysis', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Location'))
    expect(screen.getByText('Co-location Analysis')).toBeInTheDocument()
    expect(screen.getByText('Preston Bus Station')).toBeInTheDocument()
  })

  it('shows flood risk context', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Location'))
    expect(screen.getByText('Flood Risk Context')).toBeInTheDocument()
    expect(screen.getByText('River Ribble Flood Zone')).toBeInTheDocument()
  })

  it('shows crime context', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Location'))
    expect(screen.getByText('Crime Context')).toBeInTheDocument()
    expect(screen.getByText('2025-12')).toBeInTheDocument()
  })

  // --- Missing data handling ---

  it('handles asset with missing optional fields gracefully', () => {
    const minimalAsset = {
      id: 'lcc-001',
      name: 'Minimal Asset',
      category: 'other_building',
      active: true,
    }
    useData.mockReturnValue({ data: { meta: {}, assets: [minimalAsset] }, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Minimal Asset')).toBeInTheDocument()
    // No deprivation section
    expect(screen.queryByText('Deprivation Context')).not.toBeInTheDocument()
    // No ward context
    expect(screen.queryByText(/View .* on My Area page/)).not.toBeInTheDocument()
  })

  it('handles score cards with null scores', () => {
    const noScoreAsset = {
      ...baseAsset,
      sell_score: null,
      keep_score: null,
      colocate_score: null,
    }
    useData.mockReturnValue({ data: { meta: {}, assets: [noScoreAsset] }, loading: false, error: null })
    renderComponent()
    // Should show '-' for null scores
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThanOrEqual(3)
  })

  // --- Primary recommendation ---

  it('renders primary recommendation badge', () => {
    renderComponent()
    expect(screen.getByText('Primary Recommendation:')).toBeInTheDocument()
  })
})
