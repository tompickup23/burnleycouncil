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
vi.mock('../components/EvidenceTimeline.css', () => ({}))

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
  disposal: { pathway: 'strategic_hold', pathway_label: 'Strategic Hold', pathway_reasoning: 'Core administrative function, high service criticality.', complexity_score: 65, market_readiness_score: 25, revenue_potential_score: 40, smart_priority: 30, occupancy_inferred: 'occupied', occupancy_signals: ['High linked spend indicates operational use', 'Office/civic category with active services'], complexity_breakdown: [{ factor: 'Service-Occupied', points: 25 }, { factor: 'Listed building', points: 15 }], estimated_timeline: '24+ months', quick_win: false, codex: { recommendation: 'Retain', confidence: 'high', reasoning: 'Strategic headquarters.\nCore administrative function.', key_risks: 'High maintenance cost|Listed building constraints', next_steps: 'Commission condition survey|Review energy efficiency' } },
  flags: ['listed_building'],
  google_maps_url: 'https://maps.google.com/?q=53.7632,-2.7051',
  deprivation: { imd_decile: 4, income_decile: 3, employment_decile: 5, education_decile: 6, health_decile: 4, crime_decile: 2, housing_decile: 7, living_env_decile: 5, imd_rank: 5000 },
  energy: { rating: 'C', potential_rating: 'B', property_type: 'Non-Domestic', floor_area_sqm: 5000, main_heating: 'Gas boiler', valid_until: '2028-06-15', match_status: 'exact', certificate_url: 'https://epc.example.com/cert/1234' },
  spending: { total: 150000, transactions: 45, unique_suppliers: 8, condition_spend: 12000, condition_samples: 'Roof repair, window sealing', department_breakdown: [{ department: 'Libraries, Museums, Culture & Registrars', spend: 95000, txns: 28 }, { department: 'Property Group - Estates', spend: 55000, txns: 17 }] },
  supplier_links: [
    { supplier: 'Supplier A', spend: 80000, transactions: 20 },
    { supplier: 'Supplier B', spend: 70000, transactions: 25 },
  ],
  co_location: { same_postcode: 2, nearby_500m: 5, nearby_1000m: 12, nearest_name: 'Preston Bus Station', nearest_distance_m: 350 },
  flood: { areas_1km: 3, areas_3km: 8, nearest_label: 'River Ribble Flood Zone', nearest_distance_km: 0.8 },
  crime: { total_1mi: 245, violent_1mi: 87, antisocial_1mi: 63, density_band: 'high', snapshot_month: '2025-12' },
  service_status: 'community_managed',
  service_type: 'community_library',
  operator: 'Crawshawbooth Community Association',
  community_managed: true,
  facility: {
    service_status: 'community_managed',
    service_type: 'community_library',
    operator: 'Crawshawbooth Community Association',
    operator_type: 'community_association',
    community_managed: true,
    services_provided: ['children_lending', 'computers', 'wifi'],
    contact: { phone: '01onal 507167', email: null, web_url: 'https://lancashire.gov.uk/libraries/crawshawbooth' },
    community_value_score: 72,
  },
  evidence_trail: [
    { field: 'name', value: 'County Hall', source: 'codex_csv', source_label: 'Codex Property Register', date: '2025-01-15', confidence: 'high' },
    { field: 'epc_rating', value: 'C', source: 'epc_register', source_label: 'EPC Register', date: '2025-06-20', confidence: 'high' },
    { field: 'service_status', value: 'community_managed', source: 'lcc_website', source_label: 'LCC Website', date: '2026-03-04', confidence: 'high', source_url: 'https://lancashire.gov.uk/libraries/crawshawbooth' },
  ],
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
    expect(screen.getAllByText('County Hall').length).toBeGreaterThanOrEqual(1)
  })

  // --- Header ---

  it('renders header with property name', () => {
    renderComponent()
    expect(screen.getAllByText('County Hall').length).toBeGreaterThanOrEqual(1)
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
    expect(screen.getByText('Recommended Pathway')).toBeInTheDocument()
  })

  it('switches to services tab', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Services'))
    expect(screen.getByText('Service Status')).toBeInTheDocument()
  })

  it('switches to location tab', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Location'))
    expect(screen.getByText('Administrative Geography')).toBeInTheDocument()
  })

  // --- Services tab ---

  it('shows service status and operator in services tab', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Services'))
    // Community Managed badge appears in both header and services tab
    expect(screen.getAllByText('Community Managed').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Crawshawbooth Community Association/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows services provided in services tab', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Services'))
    expect(screen.getByText(/children.lending/i)).toBeInTheDocument()
    expect(screen.getByText(/computers/i)).toBeInTheDocument()
    expect(screen.getByText(/wifi/i)).toBeInTheDocument()
  })

  it('shows community value score in services tab', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Services'))
    expect(screen.getByText('72/100')).toBeInTheDocument()
  })

  it('shows no service info message when facility data is missing', () => {
    const assetNoFacility = { ...baseAsset, facility: null, service_status: null }
    useData.mockReturnValue({ data: { meta: {}, assets: [assetNoFacility] }, loading: false, error: null })
    renderComponent()
    fireEvent.click(screen.getByText('Services'))
    expect(screen.getByText(/No service information available/)).toBeInTheDocument()
  })

  // --- Service status badge in header ---

  it('shows service status badge in header', () => {
    renderComponent()
    // Community Managed badge should appear in the header area
    const badges = screen.getAllByText('Community Managed')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  // --- Evidence Timeline ---

  it('shows evidence timeline collapsible section', () => {
    renderComponent()
    expect(screen.getByText(/Evidence Timeline/)).toBeInTheDocument()
    expect(screen.getByText(/3 data points/)).toBeInTheDocument()
  })

  it('renders evidence trail entries when expanded', () => {
    renderComponent()
    // The collapsible <details> element should contain the entries
    const details = document.querySelector('.evidence-trail-collapsible')
    if (details) details.open = true
    expect(screen.getByText('Codex Property Register')).toBeInTheDocument()
    expect(screen.getByText('EPC Register')).toBeInTheDocument()
    expect(screen.getByText('LCC Website')).toBeInTheDocument()
  })

  // --- Financials tab ---

  it('shows supplier breakdown in financials', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Financials'))
    expect(screen.getByText('Supplier Breakdown')).toBeInTheDocument()
    expect(screen.getByText('Supplier A')).toBeInTheDocument()
    expect(screen.getByText('Supplier B')).toBeInTheDocument()
  })

  it('shows department breakdown in financials', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Financials'))
    expect(screen.getByText('Department Breakdown')).toBeInTheDocument()
    expect(screen.getByText('Libraries, Museums, Culture & Registrars')).toBeInTheDocument()
    expect(screen.getByText('Property Group - Estates')).toBeInTheDocument()
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

  it('shows pathway and intelligence scores in disposal tab', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Disposal'))
    expect(screen.getByText('Strategic Hold')).toBeInTheDocument()
    expect(screen.getByText('Intelligence Scores')).toBeInTheDocument()
    expect(screen.getByText('Disposal Complexity')).toBeInTheDocument()
    expect(screen.getByText('Market Readiness')).toBeInTheDocument()
  })

  it('shows codex AI analysis with risks and next steps', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Disposal'))
    expect(screen.getByText('AI Analysis')).toBeInTheDocument()
    expect(screen.getByText('high confidence')).toBeInTheDocument()
    expect(screen.getByText('Key Risks')).toBeInTheDocument()
    expect(screen.getByText('High maintenance cost')).toBeInTheDocument()
    expect(screen.getByText('Next Steps')).toBeInTheDocument()
    expect(screen.getByText('Commission condition survey')).toBeInTheDocument()
  })

  it('shows occupancy evidence and complexity factors', () => {
    renderComponent()
    fireEvent.click(screen.getByText('Disposal'))
    expect(screen.getByText('Occupancy Evidence')).toBeInTheDocument()
    expect(screen.getByText('High linked spend indicates operational use')).toBeInTheDocument()
    expect(screen.getByText('Complexity Factors')).toBeInTheDocument()
    expect(screen.getAllByText('Service-Occupied').length).toBeGreaterThan(0)
  })

  it('shows pathway card with no data gracefully', () => {
    const assetNoDisposal = { ...baseAsset, disposal: {} }
    useData.mockReturnValue({ data: { meta: {}, assets: [assetNoDisposal] }, loading: false, error: null })
    renderComponent()
    fireEvent.click(screen.getByText('Disposal'))
    expect(screen.getByText('Recommended Pathway')).toBeInTheDocument()
    expect(screen.getByText('Not assessed')).toBeInTheDocument()
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

  // --- Assessment tab ---

  describe('Assessment tab', () => {
    const assessmentAsset = {
      ...baseAsset,
      assessment: {
        recommendation: 'Dispose',
        recommendation_category: 'A. Disposal - low service signal land',
        priority_score: 85,
        confidence: 'High',
        disposal_readiness: 78,
        repurpose_potential: 25,
        service_criticality: 12,
        net_zero_priority: 45,
        resilience_need: 30,
        disposal_band: 'high',
        repurpose_band: 'low',
        service_band: 'low',
        net_zero_band: 'medium',
        resilience_band: 'low',
        innovative_use_primary: 'Community energy generation',
        innovative_use_secondary: 'Meanwhile use for local food growing',
        innovative_use_count: 2,
        reasoning: 'Land-only asset with low service signal;No active use identified',
        key_risks: 'Covenant restrictions|Environmental contamination potential',
        next_steps: 'Commission title appraisal;Undertake market test',
      },
      sales_evidence: [
        { type: 'current_lcc_sale_listing', title: 'Test Farm, Chorley', status: 'marketed', price: '38000', date: '10 March 2026', method: 'auction', url: 'https://example.com/listing', confidence: 'exact_match' },
      ],
    }

    beforeEach(() => {
      useData.mockReturnValue({ data: { meta: {}, assets: [assessmentAsset] }, loading: false, error: null })
    })

    it('switches to assessment tab and renders recommendation badge', () => {
      renderComponent()
      fireEvent.click(screen.getByText('Assessment'))
      expect(screen.getByText('Assessment Recommendation')).toBeInTheDocument()
      expect(screen.getAllByText('Dispose').length).toBeGreaterThan(0)
    })

    it('renders confidence badge', () => {
      renderComponent()
      fireEvent.click(screen.getByText('Assessment'))
      expect(screen.getByText('High confidence')).toBeInTheDocument()
    })

    it('renders priority score', () => {
      renderComponent()
      fireEvent.click(screen.getByText('Assessment'))
      expect(screen.getByText('Priority Score')).toBeInTheDocument()
      // 85 appears in both keep_score card and priority_score — use getAllByText
      expect(screen.getAllByText('85').length).toBeGreaterThanOrEqual(1)
    })

    it('renders recommendation category', () => {
      renderComponent()
      fireEvent.click(screen.getByText('Assessment'))
      expect(screen.getByText('A. Disposal - low service signal land')).toBeInTheDocument()
    })

    it('renders all five world-class dimension labels', () => {
      renderComponent()
      fireEvent.click(screen.getByText('Assessment'))
      expect(screen.getByText('World-Class Scores')).toBeInTheDocument()
      expect(screen.getByText('Disposal Readiness')).toBeInTheDocument()
      expect(screen.getByText('Repurpose Potential')).toBeInTheDocument()
      expect(screen.getByText('Service Criticality')).toBeInTheDocument()
      expect(screen.getByText('Net Zero Priority')).toBeInTheDocument()
      expect(screen.getByText('Resilience Need')).toBeInTheDocument()
    })

    it('renders world-class scores with band labels', () => {
      renderComponent()
      fireEvent.click(screen.getByText('Assessment'))
      expect(screen.getByText('78')).toBeInTheDocument()
      expect(screen.getByText('25')).toBeInTheDocument()
      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText('45')).toBeInTheDocument()
      expect(screen.getByText('30')).toBeInTheDocument()
    })

    it('renders innovative uses (primary and secondary)', () => {
      renderComponent()
      fireEvent.click(screen.getByText('Assessment'))
      expect(screen.getByText('Innovative Uses')).toBeInTheDocument()
      expect(screen.getByText('Community energy generation')).toBeInTheDocument()
      expect(screen.getByText('Meanwhile use for local food growing')).toBeInTheDocument()
      expect(screen.getByText('Primary')).toBeInTheDocument()
      expect(screen.getByText('Secondary')).toBeInTheDocument()
    })

    it('renders reasoning paragraphs (split by semicolons)', () => {
      renderComponent()
      fireEvent.click(screen.getByText('Assessment'))
      expect(screen.getByText('Land-only asset with low service signal')).toBeInTheDocument()
      expect(screen.getByText('No active use identified')).toBeInTheDocument()
    })

    it('renders key risks as list items', () => {
      renderComponent()
      fireEvent.click(screen.getByText('Assessment'))
      expect(screen.getByText('Covenant restrictions')).toBeInTheDocument()
      expect(screen.getByText('Environmental contamination potential')).toBeInTheDocument()
    })

    it('renders next steps as list items', () => {
      renderComponent()
      fireEvent.click(screen.getByText('Assessment'))
      expect(screen.getByText('Commission title appraisal')).toBeInTheDocument()
      expect(screen.getByText('Undertake market test')).toBeInTheDocument()
    })

    it('renders sales evidence table with link', () => {
      renderComponent()
      fireEvent.click(screen.getByText('Assessment'))
      expect(screen.getByText('Sales Evidence')).toBeInTheDocument()
      expect(screen.getByText(/Test Farm, Chorley/)).toBeInTheDocument()
      expect(screen.getByText('marketed')).toBeInTheDocument()
      expect(screen.getByText('38000')).toBeInTheDocument()
      expect(screen.getByText('auction')).toBeInTheDocument()
    })

    it('handles missing assessment gracefully', () => {
      const noAssessAsset = { ...baseAsset, assessment: null }
      useData.mockReturnValue({ data: { meta: {}, assets: [noAssessAsset] }, loading: false, error: null })
      renderComponent()
      fireEvent.click(screen.getByText('Assessment'))
      expect(screen.getByText('No assessment data available for this property.')).toBeInTheDocument()
    })

    it('handles empty sales_evidence gracefully', () => {
      const noSalesAsset = { ...assessmentAsset, sales_evidence: [] }
      useData.mockReturnValue({ data: { meta: {}, assets: [noSalesAsset] }, loading: false, error: null })
      renderComponent()
      fireEvent.click(screen.getByText('Assessment'))
      // Should still render assessment but no sales evidence section
      expect(screen.getByText('Assessment Recommendation')).toBeInTheDocument()
      expect(screen.queryByText('Sales Evidence')).not.toBeInTheDocument()
    })
  })

  // --- LGR Tab ---

  describe('LGR tab', () => {
    const mockLgrData = {
      proposed_models: [
        {
          id: 'two_unitary',
          name: 'Two Unitary',
          authorities: [
            { name: 'East Lancashire', councils: ['burnley', 'pendle', 'hyndburn', 'rossendale'] },
            { name: 'West & Central Lancashire', councils: ['preston', 'chorley', 'south_ribble', 'west_lancashire', 'lancaster', 'wyre', 'fylde', 'ribble_valley'] },
          ],
        },
        {
          id: 'three_unitary',
          name: 'Three Unitary',
          authorities: [
            { name: 'Pennine Lancashire', councils: ['burnley', 'pendle', 'hyndburn', 'rossendale'] },
            { name: 'Central Lancashire', councils: ['preston', 'chorley', 'south_ribble'] },
            { name: 'Bay & Rural', councils: ['lancaster', 'wyre', 'fylde', 'ribble_valley', 'west_lancashire'] },
          ],
        },
      ],
    }

    function mockUseDataForLGR(assetOverride) {
      const detailData = { meta: {}, assets: [assetOverride || baseAsset] }
      useData.mockImplementation((url) => {
        if (typeof url === 'string' && url.includes('lgr_tracker')) {
          return { data: mockLgrData, loading: false, error: null }
        }
        return { data: detailData, loading: false, error: null }
      })
    }

    it('renders LGR tab button', () => {
      mockUseDataForLGR()
      renderComponent()
      expect(screen.getByText('LGR')).toBeInTheDocument()
    })

    it('shows per-model authority assignment on LGR tab', () => {
      mockUseDataForLGR()
      renderComponent()
      fireEvent.click(screen.getByText('LGR'))
      expect(screen.getByText('LGR Authority Assignment')).toBeInTheDocument()
      expect(screen.getByText('Two Unitary')).toBeInTheDocument()
      expect(screen.getByText('Three Unitary')).toBeInTheDocument()
    })

    it('shows correct authority for asset district', () => {
      mockUseDataForLGR()
      renderComponent()
      fireEvent.click(screen.getByText('LGR'))
      // baseAsset.district = 'Preston' → West & Central Lancashire / Central Lancashire
      expect(screen.getByText('West & Central Lancashire')).toBeInTheDocument()
      expect(screen.getByText('Central Lancashire')).toBeInTheDocument()
    })

    it('shows Retained outcome for normal asset', () => {
      mockUseDataForLGR()
      renderComponent()
      fireEvent.click(screen.getByText('LGR'))
      expect(screen.getAllByText('Retained').length).toBeGreaterThanOrEqual(2)
    })

    it('shows contested for asset without matching district', () => {
      const noDistrictAsset = { ...baseAsset, district: '' }
      mockUseDataForLGR(noDistrictAsset)
      renderComponent()
      fireEvent.click(screen.getByText('LGR'))
      expect(screen.getAllByText('Contested / Unallocated').length).toBe(2)
      expect(screen.getAllByText('Unallocated').length).toBe(2)
    })

    it('shows disposal candidate for disposal category A asset', () => {
      const disposalAsset = { ...baseAsset, disposal: { ...baseAsset.disposal, category: 'A' } }
      mockUseDataForLGR(disposalAsset)
      renderComponent()
      fireEvent.click(screen.getByText('LGR'))
      expect(screen.getAllByText('Disposal Candidate').length).toBe(2)
    })

    it('shows LGR Impact Summary', () => {
      mockUseDataForLGR()
      renderComponent()
      fireEvent.click(screen.getByText('LGR'))
      expect(screen.getByText('LGR Impact Summary')).toBeInTheDocument()
      expect(screen.getByText(/clear allocation path/)).toBeInTheDocument()
    })

    it('shows fallback when lgr data is missing', () => {
      useData.mockImplementation((url) => {
        if (typeof url === 'string' && url.includes('lgr_tracker')) {
          return { data: null, loading: false, error: null }
        }
        return { data: mockDetailData, loading: false, error: null }
      })
      renderComponent()
      fireEvent.click(screen.getByText('LGR'))
      expect(screen.getByText('LGR model data not available.')).toBeInTheDocument()
    })

    it('handles land assets correctly', () => {
      const landAsset = { ...baseAsset, id: 'lcc-land-001', category: 'land_general', name: 'Woodland near Burnley', district: 'Burnley' }
      mockUseDataForLGR(landAsset)
      useParams.mockReturnValue({ propertyId: 'lcc-land-001' })
      renderComponent()
      fireEvent.click(screen.getByText('LGR'))
      // Burnley → East Lancashire / Pennine Lancashire
      expect(screen.getByText('East Lancashire')).toBeInTheDocument()
      expect(screen.getByText('Pennine Lancashire')).toBeInTheDocument()
    })
  })
})
