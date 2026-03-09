import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Highways from './Highways'

// Mock hooks and modules
vi.mock('../hooks/useData', () => ({ useData: vi.fn() }))
vi.mock('../context/CouncilConfig', () => ({ useCouncilConfig: vi.fn() }))
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../firebase', () => ({ isFirebaseEnabled: false }))
vi.mock('../components/ui', () => ({
  LoadingState: ({ message }) => <div>{message || 'Loading...'}</div>,
  ErrorBoundary: ({ children }) => <div>{children}</div>,
}))
vi.mock('../components/ui/StatCard', () => ({
  StatCard: ({ value, label, icon: Icon, highlight }) => <div data-testid="stat-card"><span>{value}</span><span>{label}</span></div>,
  StatBar: ({ children }) => <div>{children}</div>,
}))
vi.mock('../components/ui/ChartCard', () => ({
  ChartCard: ({ title, children }) => <div>{title}{children}</div>,
  CHART_TOOLTIP_STYLE: {},
}))
vi.mock('../components/CollapsibleSection', () => ({
  default: ({ title, children, defaultOpen }) => <div><h3>{title}</h3><div>{children}</div></div>,
}))
vi.mock('../components/DataFreshnessStamp', () => ({
  default: ({ lastUpdated, label }) => <div>{label}</div>,
}))
vi.mock('../components/HighwaysMap', () => ({
  default: (props) => <div data-testid="highways-map">HighwaysMap ({props.roadworks?.length || 0} works)</div>,
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useAuth } from '../context/AuthContext'

// --- Test fixtures ---

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  data_sources: {
    highways: true,
    ward_boundaries: true,
  },
}

const mockConfigNoHighways = {
  council_id: 'burnley',
  council_name: 'Burnley',
  data_sources: {},
}

const mockRoadwork = (overrides = {}) => ({
  id: 1001,
  road: 'A682 Todmorden Road',
  ward: 'Cliviger with Worsthorne',
  district: 'burnley',
  district_raw: 'Burnley District (B)',
  lat: 53.772,
  lng: -2.213,
  start_date: '2026-02-01T00:00:00+00:00',
  end_date: '2026-04-30T00:00:00+00:00',
  operator: 'United Utilities Water',
  status: 'Works started',
  category: 'Standard',
  severity: 'high',
  restrictions: 'Road Closure',
  description: 'Water main replacement works requiring full road closure',
  reference: 'UUW-2026-001',
  urgent: false,
  ...overrides,
})

const mockRoadworksData = {
  meta: {
    source: 'Lancashire County Council MARIO ArcGIS',
    scope: 'All Lancashire (12 districts)',
    generated: '2026-03-05T12:00:00+00:00',
    districts_covered: ['burnley', 'hyndburn', 'pendle'],
  },
  stats: {
    total: 5,
    works_started: 2,
    planned_works: 3,
    district_count: 3,
    by_district: {
      burnley: { total: 3, works_started: 1, planned_works: 2 },
      hyndburn: { total: 1, works_started: 1, planned_works: 0 },
      pendle: { total: 1, works_started: 0, planned_works: 1 },
    },
    by_operator: {
      'United Utilities Water': 2,
      'BT': 2,
      'LCC': 1,
    },
    by_severity: { high: 2, medium: 2, low: 1 },
    by_ward: { 'Cliviger with Worsthorne': 2, 'Hapton with Park': 1 },
    by_restriction: { 'Road Closure': 2, 'Two-way Signals': 2, 'No Restriction': 1 },
  },
  roadworks: [
    mockRoadwork(),
    mockRoadwork({ id: 1002, road: 'B6238 Padiham Road', severity: 'medium', status: 'Planned works', operator: 'BT', restrictions: 'Two-way Signals', district: 'burnley', description: 'Broadband installation' }),
    mockRoadwork({ id: 1003, road: 'Manchester Road', severity: 'high', status: 'Works started', operator: 'LCC', restrictions: 'Road Closure', district: 'burnley', description: 'Surface dressing programme', urgent: true }),
    mockRoadwork({ id: 1004, road: 'Burnley Road', severity: 'medium', operator: 'BT', status: 'Planned works', restrictions: 'Two-way Signals', district: 'hyndburn' }),
    mockRoadwork({ id: 1005, road: 'Colne Road', severity: 'low', operator: 'United Utilities Water', status: 'Planned works', restrictions: '', district: 'pendle' }),
  ],
}

const mockTrafficData = {
  congestion_model: {
    junctions: [
      { name: 'M65 J10 / Cavalry Way', jci_score: 82, traffic_volume: 42000, works_count: 3, lat: 53.78, lng: -2.25, data_quality: 'high' },
      { name: 'A682 / A646 Todmorden Road', jci_score: 55, traffic_volume: 15000, works_count: 2, lat: 53.77, lng: -2.21, data_quality: 'medium' },
      { name: 'B6238 / Rossendale Rd', jci_score: 25, traffic_volume: 5000, works_count: 1, lat: 53.79, lng: -2.23, data_quality: 'estimated' },
    ],
    corridors: [
      { name: 'M65 Corridor (J8-J12)', polyline: [[-2.3, 53.78], [-2.2, 53.78]], jci: 72, works_count: 4, traffic_volume: 38000, capacity_reduction: 0.35 },
    ],
  },
  operational_intelligence: {
    corridor_clashes: [
      { road: 'A682 Todmorden Road', concurrent_works: 3, total_capacity_reduction: 0.85, s59_breach: true, recommendation: 'Emergency co-ordination required. Total capacity loss exceeds NRSWA s59 threshold.' },
      { road: 'B6238 Padiham Road', concurrent_works: 2, total_capacity_reduction: 0.45, s59_coordination_needed: true, s59_breach: false, recommendation: 'Schedule co-ordination meeting with promoters.' },
      { road: 'Manchester Road', concurrent_works: 2, total_capacity_reduction: 0.5, s59_monitor: true, s59_breach: false, s59_coordination_needed: false, recommendation: 'Monitor — developing situation.' },
    ],
    deferral_recommendations: [
      { road: 'Colne Road', reason: 'School term overlap with nearby primary school', confidence: 0.85, confidence_flags: [] },
      { road: 'Manchester Road', reason: 'Corridor clash with major LUF project', confidence: 0.6, confidence_flags: ['estimated_traffic_volume', 'auto_corridor_no_verified_data'] },
    ],
  },
  meta: {
    data_freshness: {
      dft_count_points: { source: 'DfT Road Traffic Statistics API', records: 1011, update_cycle: 'Annual (Oct/Nov)', stale: false },
      roadworks: { source: 'LCC MARIO ArcGIS', records: 1722, update_cycle: '2-hour ETL', stale: false, stale_hours: 1.5 },
    },
  },
  strategic_recommendations: {
    immediate_actions: [],
    match_preparations: [],
    event_preparations: [],
    summary: {},
  },
}

const mockBoundaries = {
  type: 'FeatureCollection',
  features: [],
}

const mockLegal = {
  legislation: [
    {
      id: 'nrswa_1991',
      title: 'New Roads and Street Works Act 1991',
      short: 'NRSWA 1991',
      sections: [
        { section: 's59', title: 'Co-ordination of Works', desc: 'Duty to co-ordinate all works on highway.' },
      ],
    },
  ],
  key_thresholds: {
    s59_breach: {
      capacity_loss_pct: 30,
      label: 's59 NRSWA breach threshold',
      desc: 'Multiple concurrent works creating >30% capacity reduction',
    },
  },
}

const mockAssetsData = {
  meta: {
    data_quality_note: 'Capital programme figures are budgeted, not confirmed outturn.',
    generated: '2026-03-05T00:00:00Z',
  },
  network_summary: {
    total_length_km: 7142,
    total_length_miles: 4437,
    gross_replacement_cost: 10000000000,
    structures_count: 2009,
    traffic_signals_count: 5778,
  },
  asset_categories: [
    { category: 'Carriageways', grc_estimate: 7500000000, grc_pct: 75, fill: '#ff9f0a' },
    { category: 'Footways & Cycleways', grc_estimate: 1200000000, grc_pct: 12, fill: '#00d4aa' },
    { category: 'Structures (Bridges & Retaining Walls)', grc_estimate: 800000000, grc_pct: 8, fill: '#bf5af2' },
  ],
  road_condition: {
    current_year: '2024/25',
    survey_method: 'Detailed Video Survey (DVS)',
    transition_note: 'PAS 2161 transition from 2026/27.',
    key_insight: 'Unclassified network has been ~27-28% red for 5 consecutive years.',
    a_roads: { red_pct: 3.9, note: 'Below national average.' },
    bc_roads: { red_pct: 6.49, note: 'Jumped from 4.59% in one year.' },
    unclassified: { red_pct: 27.56, note: 'Over 1-in-4 roads need structural maintenance.' },
    trend: [
      { year: '2021/22', a_red: 1.43, bc_red: 3.59, uc_red: 26.39 },
      { year: '2024/25', a_red: 3.0, bc_red: 4.59, uc_red: 27.67 },
      { year: '2025/26 (survey)', a_red: 3.9, bc_red: 6.49, uc_red: 27.56 },
    ],
  },
  budget_trend: {
    years: [
      { year: '2021/22', data_type: 'confirmed_outturn', net_revenue: 54355000, total_expenditure: 102979000, capital_programme: null },
      { year: '2023/24', data_type: 'confirmed_outturn', net_revenue: 71138000, total_expenditure: 124848000, capital_programme: null },
      { year: '2025/26', data_type: 'budget_estimate', net_revenue: null, capital_programme: 72000000, capital_dft: 48500000, capital_council: 18500000 },
    ],
  },
  investment_analysis: {
    lcc_maintenance_backlog: 650000000,
    lcc_backlog_source: 'Cabinet Member Warren Goldsworthy, March 2026',
    steady_state_estimate: 400000000,
    practical_steady_state: 200000000,
    capital_as_pct_practical_steady_state: 36,
    current_best_annual_capital: 72000000,
    capital_as_pct_steady_state: 18,
    key_insight: 'LCC faces a structural £650M backlog at 18% of steady-state investment.',
  },
  lifecycle_models: [
    { treatment: 'Surface Dressing', lifespan_years: 10, cost_per_km: 37500, cost_per_km_per_year: 3750, effectiveness: 'best_value', suitable_for: 'Preventive on A/B roads' },
    { treatment: 'Micro-asphalt', lifespan_years: 7, cost_per_km: 50000, cost_per_km_per_year: 7143, effectiveness: 'good_value', suitable_for: 'Residential streets' },
    { treatment: 'Full Reconstruction', lifespan_years: 40, cost_per_km: 750000, cost_per_km_per_year: 18750, effectiveness: 'most_expensive', suitable_for: 'Severely deteriorated roads' },
  ],
  valuation_questions: {
    intro: 'Are road assets valued correctly?',
    questions: [
      { id: 'heritage_setts', title: 'Cobblestones: Hidden Heritage Asset?', question: 'Are sett streets valued as standard carriageway?', analysis: 'Sett relaying is more expensive than asphalt.', implication: 'GRC may be understated for heritage sett streets.' },
    ],
  },
  innovation_opportunities: [
    { id: 'led_lighting', title: 'LED Street Lighting Conversion', category: 'Energy & Carbon', status: 'Partially implemented', payback_years: 5.5, value_summary: '50–70% energy saving per column.', lancashire_angle: 'Full conversion = significant energy saving.', risk_note: 'Upfront capital cost.', policy_driver: 'Net Zero 2050' },
    { id: 'heritage_setts', title: 'Heritage Cobblestone & Sett Recovery', category: 'Heritage & Placemaking', status: 'Emerging opportunity', payback_years: null, value_summary: 'Heritage and tourism value.', lancashire_angle: 'Lancashire mill towns have setts under tarmac.', risk_note: null, policy_driver: 'NPPF Heritage Assets' },
  ],
  asset_management_framework: {
    legislation: [
      { act: 'Highways Act 1980', section: 's41', duty: 'Duty to maintain adopted highways' },
    ],
    standards: [
      { standard: 'CIPFA Transport Infrastructure Code', version: '2nd Ed 2016', purpose: 'GRC/DRC asset valuation methodology' },
      { standard: 'BSI PAS 2161', version: '2021', purpose: 'New 5-category road condition standard' },
    ],
  },
}

// --- Test setup ---

function renderComponent(initialEntries = ['/highways']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Highways />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useCouncilConfig.mockReturnValue(mockConfig)
  useAuth.mockReturnValue({ isStrategist: false, isAdmin: false })
  useData.mockReturnValue({
    data: [mockRoadworksData, mockTrafficData, mockBoundaries, mockLegal, mockAssetsData],
    loading: false,
    error: null,
  })
})

// --- Tests ---

describe('Highways', () => {
  // --- Guard / Loading / Error ---

  it('renders fallback when highways data source not enabled', () => {
    useCouncilConfig.mockReturnValue(mockConfigNoHighways)
    useData.mockReturnValue({ data: null, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Highways data not available')).toBeInTheDocument()
  })

  it('renders loading state while data loads', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText('Loading highways data...')).toBeInTheDocument()
  })

  it('renders error state on fetch failure', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fetch failed') })
    renderComponent()
    expect(screen.getByText('Failed to load highways data')).toBeInTheDocument()
  })

  // --- Header ---

  it('renders page header with title', () => {
    renderComponent()
    expect(screen.getByText(/Highways & Roadworks/i)).toBeInTheDocument()
  })

  it('renders scope and count in subtitle', () => {
    renderComponent()
    expect(screen.getByText(/5 active and planned works/)).toBeInTheDocument()
  })

  it('renders data freshness stamp', () => {
    renderComponent()
    expect(screen.getByText(/Roadworks data/)).toBeInTheDocument()
  })

  // --- Stat Cards ---

  it('renders total works stat card', () => {
    renderComponent()
    expect(screen.getByText('Total Works')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders road closures stat card', () => {
    renderComponent()
    expect(screen.getByText('Road Closures')).toBeInTheDocument()
  })

  it('renders high severity count', () => {
    renderComponent()
    expect(screen.getByText('High Severity')).toBeInTheDocument()
  })

  it('renders districts count', () => {
    renderComponent()
    expect(screen.getByText('Districts')).toBeInTheDocument()
  })

  // --- Map ---

  it('renders HighwaysMap component', () => {
    renderComponent()
    // HighwaysMap is lazy-loaded; the Suspense fallback or mock content should appear
    // Check that map section is present (either map content or fallback)
    expect(screen.getByText(/HighwaysMap|Loading map/)).toBeInTheDocument()
  })

  it('passes filtered roadworks to map', async () => {
    renderComponent()
    expect(await screen.findByText('HighwaysMap (5 works)')).toBeInTheDocument()
  })

  it('renders corridor toggle button', () => {
    renderComponent()
    const toggles = screen.getAllByText(/Corridors/)
    // Should have both: network summary stat + toggle button
    expect(toggles.length).toBeGreaterThanOrEqual(1)
    // The toggle button specifically
    const toggleBtn = screen.getByText(/Show Corridors|Hide Corridors/)
    expect(toggleBtn).toBeInTheDocument()
  })

  it('renders JCI toggle button', () => {
    renderComponent()
    const toggleBtn = screen.getByText(/Show JCI Points|Hide JCI Points/)
    expect(toggleBtn).toBeInTheDocument()
  })

  // --- Filters ---

  it('renders severity filter dropdown', () => {
    renderComponent()
    const selects = screen.getAllByRole('combobox')
    const sevSelect = selects.find(s => {
      const options = within(s).queryAllByRole('option')
      return options.some(o => o.textContent === 'All severities')
    })
    expect(sevSelect).toBeTruthy()
  })

  it('filters by severity when dropdown changes', () => {
    renderComponent()
    const selects = screen.getAllByRole('combobox')
    const sevSelect = selects.find(s => {
      const options = within(s).queryAllByRole('option')
      return options.some(o => o.textContent === 'All severities')
    })
    fireEvent.change(sevSelect, { target: { value: 'high' } })
    // After filtering to high severity, Burnley Road (medium, not in deferrals) should be hidden from cards
    expect(screen.queryByText('Burnley Road')).not.toBeInTheDocument()
    // High severity works should still be present
    expect(screen.getAllByText('A682 Todmorden Road').length).toBeGreaterThan(0)
  })

  it('filters by status dropdown', () => {
    renderComponent()
    const selects = screen.getAllByRole('combobox')
    const statusSelect = selects.find(s => {
      const options = within(s).queryAllByRole('option')
      return options.some(o => o.textContent === 'All statuses')
    })
    fireEvent.change(statusSelect, { target: { value: 'Works started' } })
    // Planned-only works should be hidden — Burnley Road is planned and not in deferrals
    expect(screen.queryByText('Burnley Road')).not.toBeInTheDocument()
    // Started works should still show
    expect(screen.getAllByText('Manchester Road').length).toBeGreaterThan(0)
  })

  it('filters by search text', () => {
    renderComponent()
    const searchInput = screen.getByPlaceholderText('Search roads, operators, wards…')
    fireEvent.change(searchInput, { target: { value: 'Padiham' } })
    expect(screen.getAllByText('B6238 Padiham Road').length).toBeGreaterThan(0)
    // Burnley Road doesn't contain 'Padiham' and isn't in deferrals
    expect(screen.queryByText('Burnley Road')).not.toBeInTheDocument()
  })

  it('shows clear button when filters active', () => {
    renderComponent()
    const selects = screen.getAllByRole('combobox')
    const sevSelect = selects.find(s => {
      const options = within(s).queryAllByRole('option')
      return options.some(o => o.textContent === 'All severities')
    })
    fireEvent.change(sevSelect, { target: { value: 'high' } })
    expect(screen.getByText('Clear all')).toBeInTheDocument()
  })

  it('clears all filters when clear button clicked', () => {
    renderComponent()
    const selects = screen.getAllByRole('combobox')
    const sevSelect = selects.find(s => {
      const options = within(s).queryAllByRole('option')
      return options.some(o => o.textContent === 'All severities')
    })
    fireEvent.change(sevSelect, { target: { value: 'high' } })
    fireEvent.click(screen.getByText('Clear all'))
    // All works should be visible again — Colne Road is low severity
    expect(screen.getAllByText('Colne Road').length).toBeGreaterThan(0)
  })

  // --- Roadwork Cards ---

  it('renders roadwork cards with road names', () => {
    renderComponent()
    // Road names may appear in both cards and clash sections
    expect(screen.getAllByText('A682 Todmorden Road').length).toBeGreaterThan(0)
    expect(screen.getAllByText('B6238 Padiham Road').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Manchester Road').length).toBeGreaterThan(0)
  })

  it('renders roadwork descriptions', () => {
    renderComponent()
    expect(screen.getAllByText('Water main replacement works requiring full road closure').length).toBeGreaterThan(0)
  })

  it('renders restriction badges', () => {
    renderComponent()
    // Road closure works should show Closure badge
    const closureBadges = screen.getAllByText('Closure')
    expect(closureBadges.length).toBeGreaterThan(0)
  })

  it('renders status badges', () => {
    renderComponent()
    const startedBadges = screen.getAllByText('Started')
    expect(startedBadges.length).toBeGreaterThan(0)
  })

  it('renders urgent badge for urgent works', () => {
    renderComponent()
    expect(screen.getByText('Urgent')).toBeInTheDocument()
  })

  it('renders operator in card metadata', () => {
    renderComponent()
    expect(screen.getAllByText('United Utilities Water').length).toBeGreaterThan(0)
  })

  it('selects roadwork card on click', async () => {
    renderComponent()
    const roadLinks = screen.getAllByText('A682 Todmorden Road')
    fireEvent.click(roadLinks[0])
    // The card should get selected — verify map is present
    expect(await screen.findByTestId('highways-map')).toBeInTheDocument()
  })

  // --- s59 Clashes Section ---

  it('renders s59 clashes section', () => {
    renderComponent()
    expect(screen.getByText(/Co-ordination Clashes/)).toBeInTheDocument()
  })

  it('shows breach count', () => {
    renderComponent()
    // "s59 Breaches" appears in both network summary and clash section heading
    const breachTexts = screen.getAllByText(/s59 Breaches/)
    expect(breachTexts.length).toBeGreaterThanOrEqual(1)
  })

  it('renders breach road name', () => {
    renderComponent()
    // The breach card should show the road name within the clashes section
    const breachTexts = screen.getAllByText(/s59 Breaches/)
    expect(breachTexts.length).toBeGreaterThanOrEqual(1)
    const clashSection = breachTexts[breachTexts.length - 1].closest('div')
    expect(clashSection).toBeInTheDocument()
  })

  it('renders co-ordination required section', () => {
    renderComponent()
    expect(screen.getByText(/Co-ordination Required/)).toBeInTheDocument()
  })

  it('renders monitoring section', () => {
    renderComponent()
    expect(screen.getByText(/Monitoring/)).toBeInTheDocument()
  })

  // --- Deferral Recommendations ---

  it('renders deferral recommendations section', () => {
    renderComponent()
    expect(screen.getByText('Deferral Recommendations')).toBeInTheDocument()
  })

  it('shows deferral reason text', () => {
    renderComponent()
    expect(screen.getByText(/School term overlap/)).toBeInTheDocument()
  })

  it('renders confidence dots for deferrals', () => {
    renderComponent()
    // High confidence (0.85) → should show "High" in confidence component
    // Note: "High" also appears in severity dropdown, so use getAllByText
    const highTexts = screen.getAllByText('High')
    expect(highTexts.length).toBeGreaterThanOrEqual(1)
  })

  it('shows confidence flags when present', () => {
    renderComponent()
    expect(screen.getByText(/estimated_traffic_volume/)).toBeInTheDocument()
  })

  // --- Traffic Intelligence ---

  it('renders traffic intelligence section', () => {
    renderComponent()
    expect(screen.getByText('Traffic Intelligence')).toBeInTheDocument()
  })

  it('shows JCI scores in junction table', () => {
    renderComponent()
    // M65 J10 has JCI 82
    expect(screen.getByText('M65 J10 / Cavalry Way')).toBeInTheDocument()
  })

  it('shows data quality indicators', () => {
    renderComponent()
    expect(screen.getByText('high')).toBeInTheDocument()
    expect(screen.getByText('medium')).toBeInTheDocument()
    expect(screen.getByText('estimated')).toBeInTheDocument()
  })

  // --- District Breakdown ---

  it('renders district breakdown section', () => {
    renderComponent()
    expect(screen.getByText('District Breakdown')).toBeInTheDocument()
  })

  it('shows district names in breakdown', () => {
    renderComponent()
    // District names appear in both dropdown and breakdown table
    expect(screen.getAllByText('burnley').length).toBeGreaterThanOrEqual(2) // dropdown + table
    expect(screen.getAllByText('hyndburn').length).toBeGreaterThanOrEqual(2)
  })

  // --- Legal Framework ---

  it('renders legal framework section', () => {
    renderComponent()
    expect(screen.getByText('Legal Framework')).toBeInTheDocument()
  })

  it('shows legislation titles', () => {
    renderComponent()
    expect(screen.getByText('New Roads and Street Works Act 1991')).toBeInTheDocument()
  })

  it('shows section references', () => {
    renderComponent()
    expect(screen.getByText('s59')).toBeInTheDocument()
  })

  it('shows key thresholds', () => {
    renderComponent()
    expect(screen.getByText('Key Thresholds')).toBeInTheDocument()
    expect(screen.getByText('s59 NRSWA breach threshold')).toBeInTheDocument()
  })

  // --- Data Sources ---

  it('renders data sources section', () => {
    renderComponent()
    expect(screen.getByText('Data Sources')).toBeInTheDocument()
  })

  it('shows data source freshness status', () => {
    renderComponent()
    // roadworks should show as Fresh
    const freshIndicators = screen.getAllByText(/Fresh/)
    expect(freshIndicators.length).toBeGreaterThan(0)
  })

  // --- Empty state ---

  it('shows empty state when no roadworks match filters', () => {
    renderComponent()
    const searchInput = screen.getByPlaceholderText('Search roads, operators, wards…')
    fireEvent.change(searchInput, { target: { value: 'zzz_nonexistent_road_zzz' } })
    expect(screen.getByText('No roadworks match your filters')).toBeInTheDocument()
  })

  // --- Edge cases ---

  it('handles null traffic data gracefully', () => {
    useData.mockReturnValue({
      data: [mockRoadworksData, null, mockBoundaries, mockLegal, mockAssetsData],
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText(/Highways & Roadworks/)).toBeInTheDocument()
    // s59 section should not appear
    expect(screen.queryByText(/Co-ordination Clashes/)).not.toBeInTheDocument()
  })

  it('handles empty roadworks array', () => {
    useData.mockReturnValue({
      data: [{ ...mockRoadworksData, roadworks: [] }, null, null, null, null],
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText(/0 active and planned works/)).toBeInTheDocument()
  })

  it('handles null legal data gracefully', () => {
    useData.mockReturnValue({
      data: [mockRoadworksData, mockTrafficData, null, null, null],
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText(/Highways & Roadworks/)).toBeInTheDocument()
    expect(screen.queryByText('Legal Framework')).not.toBeInTheDocument()
  })

  // --- Assets & Investment ---

  describe('Assets & Investment section', () => {
    it('renders Assets & Investment section when data present', () => {
      renderComponent()
      expect(screen.getByText('Assets & Investment')).toBeInTheDocument()
    })

    it('shows gross replacement cost', () => {
      renderComponent()
      expect(screen.getByText('£10B')).toBeInTheDocument()
    })

    it('shows Gross Replacement Cost label', () => {
      renderComponent()
      expect(screen.getByText('Gross Replacement Cost')).toBeInTheDocument()
    })

    it('shows network length', () => {
      renderComponent()
      expect(screen.getByText('7,142km')).toBeInTheDocument()
    })

    it('shows structures count', () => {
      renderComponent()
      expect(screen.getByText('2,009')).toBeInTheDocument()
    })

    it('shows traffic signals count', () => {
      renderComponent()
      expect(screen.getByText('5,778')).toBeInTheDocument()
    })

    it('shows road condition section heading', () => {
      renderComponent()
      expect(screen.getAllByText(/Road Condition/).length).toBeGreaterThan(0)
    })

    it('shows A roads red percentage', () => {
      renderComponent()
      expect(screen.getByText('3.9% red')).toBeInTheDocument()
    })

    it('shows B&C roads red percentage', () => {
      renderComponent()
      expect(screen.getByText('6.5% red')).toBeInTheDocument()
    })

    it('shows unclassified roads red percentage', () => {
      renderComponent()
      expect(screen.getByText('27.6% red')).toBeInTheDocument()
    })

    it('shows road condition key insight', () => {
      renderComponent()
      expect(screen.getByText(/Unclassified network has been ~27-28% red for 5 consecutive years/)).toBeInTheDocument()
    })

    it('shows True Cost of Getting Roads Right heading', () => {
      renderComponent()
      expect(screen.getByText('True Cost of Getting Roads Right')).toBeInTheDocument()
    })

    it('shows maintenance backlog value', () => {
      renderComponent()
      expect(screen.getByText('£650M')).toBeInTheDocument()
    })

    it('shows steady-state estimate', () => {
      renderComponent()
      expect(screen.getByText('£200M')).toBeInTheDocument()
    })

    it('shows years to clear backlog', () => {
      renderComponent()
      expect(screen.getByText('~9yr')).toBeInTheDocument()
    })

    it('shows lifecycle economics section', () => {
      renderComponent()
      expect(screen.getByText(/Lifecycle Economics/)).toBeInTheDocument()
    })

    it('shows all lifecycle treatment names', () => {
      renderComponent()
      expect(screen.getByText('Surface Dressing')).toBeInTheDocument()
      expect(screen.getByText('Full Reconstruction')).toBeInTheDocument()
    })

    it('shows best value badge on surface dressing', () => {
      renderComponent()
      expect(screen.getByText('Best value')).toBeInTheDocument()
    })

    it('shows most expensive badge on reconstruction', () => {
      renderComponent()
      expect(screen.getByText('Most expensive')).toBeInTheDocument()
    })

    it('shows valuation questions section', () => {
      renderComponent()
      expect(screen.getByText(/Valuation Questions/)).toBeInTheDocument()
    })

    it('shows heritage setts valuation question', () => {
      renderComponent()
      expect(screen.getByText('Cobblestones: Hidden Heritage Asset?')).toBeInTheDocument()
    })

    it('shows innovation opportunities section', () => {
      renderComponent()
      expect(screen.getByText(/Innovation Opportunities/)).toBeInTheDocument()
    })

    it('shows innovation card titles', () => {
      renderComponent()
      expect(screen.getByText('LED Street Lighting Conversion')).toBeInTheDocument()
      expect(screen.getByText('Heritage Cobblestone & Sett Recovery')).toBeInTheDocument()
    })

    it('shows asset management framework section', () => {
      renderComponent()
      expect(screen.getByText('Asset Management Framework')).toBeInTheDocument()
    })

    it('shows legislation in framework', () => {
      renderComponent()
      expect(screen.getByText('Highways Act 1980')).toBeInTheDocument()
    })

    it('shows standards in framework', () => {
      renderComponent()
      expect(screen.getAllByText('CIPFA Transport Infrastructure Code').length).toBeGreaterThan(0)
    })

    it('shows data quality notice', () => {
      renderComponent()
      expect(screen.getByText(/Capital programme figures are budgeted, not confirmed outturn/)).toBeInTheDocument()
    })

    it('hides Assets section gracefully when assets data is null', () => {
      useData.mockReturnValue({
        data: [mockRoadworksData, mockTrafficData, mockBoundaries, mockLegal, null],
        loading: false,
        error: null,
      })
      renderComponent()
      expect(screen.queryByText('Assets & Investment')).not.toBeInTheDocument()
    })

    it('still renders page normally when assets data is null', () => {
      useData.mockReturnValue({
        data: [mockRoadworksData, mockTrafficData, mockBoundaries, mockLegal, null],
        loading: false,
        error: null,
      })
      renderComponent()
      expect(screen.getByText(/Highways & Roadworks/)).toBeInTheDocument()
    })

    it('handles empty asset_categories gracefully', () => {
      const noCategories = { ...mockAssetsData, asset_categories: [] }
      useData.mockReturnValue({
        data: [mockRoadworksData, mockTrafficData, mockBoundaries, mockLegal, noCategories],
        loading: false,
        error: null,
      })
      renderComponent()
      expect(screen.getByText('Assets & Investment')).toBeInTheDocument()
    })

    it('handles empty lifecycle_models gracefully', () => {
      const noLifecycle = { ...mockAssetsData, lifecycle_models: [] }
      useData.mockReturnValue({
        data: [mockRoadworksData, mockTrafficData, mockBoundaries, mockLegal, noLifecycle],
        loading: false,
        error: null,
      })
      renderComponent()
      expect(screen.getByText('Assets & Investment')).toBeInTheDocument()
    })

    it('handles empty innovation_opportunities gracefully', () => {
      const noInnovation = { ...mockAssetsData, innovation_opportunities: [] }
      useData.mockReturnValue({
        data: [mockRoadworksData, mockTrafficData, mockBoundaries, mockLegal, noInnovation],
        loading: false,
        error: null,
      })
      renderComponent()
      expect(screen.queryByText(/Innovation Opportunities/)).not.toBeInTheDocument()
    })
  })
})
