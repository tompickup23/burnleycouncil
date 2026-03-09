import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  default: ({ title, children }) => <div><h3>{title}</h3><div>{children}</div></div>,
}))
vi.mock('../components/DataFreshnessStamp', () => ({
  default: ({ lastUpdated, label }) => <div>{label}</div>,
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useAuth } from '../context/AuthContext'

// --- Test fixtures ---

const mockConfig = {
  council_id: 'lancashire_cc',
  council_name: 'Lancashire County Council',
  council_full_name: 'Lancashire County Council',
  data_sources: {
    highways: true,
  },
}

const mockConfigNoHighways = {
  council_id: 'burnley',
  council_name: 'Burnley',
  data_sources: {},
}

const mockTrafficData = {
  road_infrastructure: {
    summary: {
      total_features: 12000,
      traffic_signals: 5778,
      roundabouts: 2240,
      mini_roundabouts: 879,
      level_crossings: 286,
      narrow_roads: 1225,
      bridges: 2009,
      weight_restrictions: 618,
      height_restrictions: 626,
    },
    speed_zones: {
      '20': 120,
      '30': 800,
      '40': 200,
      '50': 100,
      '60': 400,
      '70': 150,
    },
    hotspots: [
      { name: 'M65 J10 Junction', severity: 'high', detail: 'Multiple concurrent works', nearby_works: 5, feature_count: 12, type: 'junction' },
      { name: 'A59 Corridor', severity: 'medium', detail: 'Signal cluster', nearby_works: 2, feature_count: 8, type: 'corridor' },
    ],
    level_crossings_detail: [
      { name: 'Rose Grove Level Crossing', barrier_type: 'Full barrier', nearby_works: 1 },
      { name: 'Huncoat Level Crossing', barrier_type: 'Half barrier', nearby_works: 0 },
    ],
  },
  meta: {
    data_freshness: {
      dft_count_points: { source: 'DfT Road Traffic Statistics API', records: 1011, update_cycle: 'Annual (Oct/Nov)', stale: false },
    },
  },
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
    {
      id: 'highways_act_1980',
      title: 'Highways Act 1980',
      short: 'HA 1980',
      sections: [
        { section: 's41', title: 'Duty to Maintain', desc: 'Duty to maintain adopted highways at public expense.' },
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
  cost_inflation: {
    indices: { construction_infrastructure_2015_2025: 45, cpi_cumulative_2015_2025: 40 },
    buying_power_analysis: { budget_2015: 25000000, budget_2027_in_2015_terms: 50000000 },
    component_costs: [
      { material: 'Bitumen', change_pct: 92, note: 'Oil price driven.', source: 'BEIS' },
      { material: 'Concrete', change_pct: 55, note: 'Cement price pressure.', source: 'ONS' },
    ],
    bcis_forecasts_2025_2030: {
      civil_engineering_tender_prices_pct: 25,
      labour_costs_pct: 18,
      building_costs_pct: 15,
      note: 'BCIS Q1 2025 forecast.',
    },
    backlog_inflation_impact: {
      backlog_today: 650000000,
      backlog_in_5yr: 800000000,
      backlog_in_10yr: 950000000,
      note: 'Assumes 3% annual cost inflation on deferred maintenance.',
    },
    source_note: 'Sources: BCIS, ONS, BEIS, RAC Foundation.',
  },
  future_outlook: {
    summary: 'Multiple converging pressures threaten the long-term condition of Lancashire highways.',
    population: { growth_pct_25yr: 5, highway_impact: 'More vehicles on already strained network.', source: 'ONS 2022-based projections' },
    ev_transition: { ev_weight_premium_pct: 30, highway_impact: 'Heavier EVs accelerate road surface deterioration.', source: 'RAC Foundation 2024' },
    lgv_growth: { lgv_increase_2010_2023_pct: 42, highway_impact: 'Delivery vans cause disproportionate road wear.', source: 'DfT Road Traffic Statistics' },
    climate_change: { bc_roads_deterioration_2024_25_pct: 41, highway_impact: 'Freeze-thaw cycles and flooding accelerate deterioration.', source: 'AIA ALARM Survey 2025' },
    autonomous_vehicles: { highway_impact: 'Road markings and signage must meet machine-readable standards.', source: 'Automated Vehicles Act 2024' },
    motoring_tax_crisis: { cost_of_freeze_since_2011: 100000000000, highway_impact: 'Fuel duty freeze reduces funding available for local roads.', source: 'IFS 2024' },
  },
  spending_integration: {
    total_identifiable_highways_spend: 8100000,
    budget_departments_count: 42,
    data_source: 'LCC spending data 2024/25.',
    top_contractors: [
      { supplier: 'Lancashire Highways Ltd', annual_spend: 3500000, share_pct: 43, note: 'Primary maintenance contractor' },
      { supplier: 'Tarmac Trading', annual_spend: 1200000, share_pct: 15, note: 'Surfacing materials' },
    ],
    concentration_note: 'Top contractor holds 43% of identifiable highways spend — moderate concentration.',
    cross_reference_note: 'Cross-reference with DOGE spending analysis for full picture.',
  },
}

const mockProcPipeline = {
  service_tiers: {
    upper_tier: {
      contracts: {
        highways: {
          total_value: 122300000,
          exercises: [
            { title: 'A, B & C Road Resurfacing', value: 48000000, term: '4 years', geographic_lots: 'North/South/East', risk: 'critical', note: 'Crosses vesting day' },
            { title: 'Unclassified Road Resurfacing', value: 32000000, term: '4 years', geographic_lots: 'North/South/East', risk: 'high', note: null },
          ],
          unitary_contracts: [
            { title: 'Blackpool Highways Contract', authority: 'Blackpool', value: 15000000, source: 'Contracts Finder', note: 'Existing PFI' },
          ],
          dft_settlement: {
            total: 231800000,
            note: 'DfT confirmed 4-year settlement for LCC.',
            years: [
              { year: '2026/27', amount: 55000000 },
              { year: '2027/28', amount: 58000000 },
              { year: '2028/29', amount: 59000000 },
              { year: '2029/30', amount: 59800000 },
            ],
          },
        },
      },
    },
  },
  delay_case: { recommended_vesting: 'April 2029' },
}

// --- Test setup ---

function renderComponent(initialEntries = ['/highways']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Highways />
    </MemoryRouter>
  )
}

// Track call index to return different data for each useData call
// First call: allData array [traffic, legal, assets], second call: procPipeline
function setupMocks(overrides = {}) {
  const {
    traffic = mockTrafficData,
    legal = mockLegal,
    assets = mockAssetsData,
    procPipeline = mockProcPipeline,
    loading = false,
    error = null,
    config = mockConfig,
  } = overrides

  useCouncilConfig.mockReturnValue(config)
  useAuth.mockReturnValue({ isStrategist: false, isAdmin: false })

  let callIndex = 0
  useData.mockImplementation((url) => {
    // First call is the array of 3 data files
    if (Array.isArray(url)) {
      return { data: [traffic, legal, assets], loading, error }
    }
    // Second call is procurement pipeline (string URL)
    if (url === '/data/shared/procurement_pipeline.json') {
      return { data: procPipeline, loading: false, error: null }
    }
    // Null URL (highways not enabled)
    return { data: null, loading: false, error: null }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setupMocks()
})

// --- Tests ---

describe('Highways', () => {
  // --- Guard / Loading / Error ---

  it('renders fallback when highways data source not enabled', () => {
    setupMocks({ config: mockConfigNoHighways })
    renderComponent()
    expect(screen.getByText('Highways data not available')).toBeInTheDocument()
  })

  it('renders loading state while data loads', () => {
    setupMocks({ loading: true, traffic: null, legal: null, assets: null })
    // Override useData to return loading for array call
    useData.mockImplementation((url) => {
      if (Array.isArray(url)) return { data: null, loading: true, error: null }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText('Loading highways data...')).toBeInTheDocument()
  })

  it('renders error state on fetch failure', () => {
    useData.mockImplementation((url) => {
      if (Array.isArray(url)) return { data: null, loading: false, error: new Error('fetch failed') }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText('Failed to load highways data')).toBeInTheDocument()
  })

  // --- Header ---

  it('renders page header with departmental title', () => {
    renderComponent()
    expect(screen.getByText(/Highways Department/)).toBeInTheDocument()
  })

  it('renders subtitle with asset base description', () => {
    renderComponent()
    expect(screen.getByText(/7,142km road network/)).toBeInTheDocument()
  })

  it('renders data freshness stamp', () => {
    renderComponent()
    expect(screen.getByText(/Highways data/)).toBeInTheDocument()
  })

  // --- CTA Card ---

  it('renders CTA link to live roadworks map', () => {
    renderComponent()
    expect(screen.getByText('View Live Roadworks Map')).toBeInTheDocument()
    expect(screen.getByText(/live roadworks, traffic intelligence/)).toBeInTheDocument()
  })

  it('CTA links to /roadworks', () => {
    renderComponent()
    const link = screen.getByText('View Live Roadworks Map').closest('a')
    expect(link).toHaveAttribute('href', '/roadworks')
  })

  // --- Road Infrastructure ---

  it('renders Road Infrastructure section', () => {
    renderComponent()
    expect(screen.getByText('Road Infrastructure')).toBeInTheDocument()
  })

  it('shows traffic signals count in infrastructure grid', () => {
    renderComponent()
    // "Traffic Signals" appears in both infrastructure grid and Assets section
    expect(screen.getAllByText('Traffic Signals').length).toBeGreaterThanOrEqual(1)
    // 5,778 appears in both hero subtitle and infrastructure grid
    expect(screen.getAllByText('5,778').length).toBeGreaterThanOrEqual(1)
  })

  it('shows roundabouts count', () => {
    renderComponent()
    expect(screen.getByText('Roundabouts')).toBeInTheDocument()
    expect(screen.getByText('2,240')).toBeInTheDocument()
  })

  it('shows level crossings count', () => {
    renderComponent()
    // "Level Crossings" may appear both in summary grid and crossings detail heading
    expect(screen.getAllByText(/Level Crossings/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows speed limit distribution', () => {
    renderComponent()
    expect(screen.getByText('Speed Limit Distribution')).toBeInTheDocument()
    expect(screen.getByText(/30mph/)).toBeInTheDocument()
  })

  it('shows infrastructure hotspots', () => {
    renderComponent()
    expect(screen.getByText('Infrastructure Hotspots')).toBeInTheDocument()
    expect(screen.getByText('M65 J10 Junction')).toBeInTheDocument()
  })

  it('shows level crossings detail table', () => {
    renderComponent()
    expect(screen.getByText('Rose Grove Level Crossing')).toBeInTheDocument()
    expect(screen.getByText('Full barrier')).toBeInTheDocument()
  })

  it('shows infrastructure placeholder when data missing', () => {
    setupMocks({ traffic: { road_infrastructure: null, meta: {} } })
    renderComponent()
    expect(screen.getByText(/Infrastructure data being collected/)).toBeInTheDocument()
  })

  // --- Legal Framework ---

  it('renders legal framework section', () => {
    renderComponent()
    expect(screen.getByText('Legal Framework')).toBeInTheDocument()
  })

  it('shows legislation titles', () => {
    renderComponent()
    expect(screen.getByText('New Roads and Street Works Act 1991')).toBeInTheDocument()
    // "Highways Act 1980" appears in both Legal Framework and Asset Management Framework
    expect(screen.getAllByText('Highways Act 1980').length).toBeGreaterThanOrEqual(1)
  })

  it('shows section references', () => {
    renderComponent()
    // s59 and s41 may appear in multiple places (legal tables + asset framework)
    expect(screen.getAllByText('s59').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('s41').length).toBeGreaterThanOrEqual(1)
  })

  it('shows key thresholds', () => {
    renderComponent()
    expect(screen.getByText('Key Thresholds')).toBeInTheDocument()
    expect(screen.getByText('s59 NRSWA breach threshold')).toBeInTheDocument()
  })

  it('hides legal section when legal data is null', () => {
    setupMocks({ legal: null })
    renderComponent()
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
      // 2,009 appears in both hero subtitle and Assets section
      expect(screen.getAllByText('2,009').length).toBeGreaterThanOrEqual(1)
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
      // Appears both in Legal Framework section AND in Asset Management Framework
      expect(screen.getAllByText('Highways Act 1980').length).toBeGreaterThan(0)
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
      setupMocks({ assets: null })
      renderComponent()
      expect(screen.queryByText('Assets & Investment')).not.toBeInTheDocument()
    })

    it('still renders page normally when assets data is null', () => {
      setupMocks({ assets: null })
      renderComponent()
      expect(screen.getByText(/Highways Department/)).toBeInTheDocument()
    })

    it('handles empty asset_categories gracefully', () => {
      setupMocks({ assets: { ...mockAssetsData, asset_categories: [] } })
      renderComponent()
      expect(screen.getByText('Assets & Investment')).toBeInTheDocument()
    })

    it('handles empty lifecycle_models gracefully', () => {
      setupMocks({ assets: { ...mockAssetsData, lifecycle_models: [] } })
      renderComponent()
      expect(screen.getByText('Assets & Investment')).toBeInTheDocument()
    })

    it('handles empty innovation_opportunities gracefully', () => {
      setupMocks({ assets: { ...mockAssetsData, innovation_opportunities: [] } })
      renderComponent()
      expect(screen.queryByText(/Innovation Opportunities/)).not.toBeInTheDocument()
    })
  })

  // --- Construction Cost Inflation ---

  describe('Construction Cost Inflation section', () => {
    it('renders cost inflation section', () => {
      renderComponent()
      expect(screen.getByText('Construction Cost Inflation')).toBeInTheDocument()
    })

    it('shows buying power analysis', () => {
      renderComponent()
      expect(screen.getByText(/Buying power in real terms/)).toBeInTheDocument()
    })

    it('shows component cost cards', () => {
      renderComponent()
      expect(screen.getByText('Bitumen')).toBeInTheDocument()
      expect(screen.getByText('Concrete')).toBeInTheDocument()
    })

    it('shows percentage change on components', () => {
      renderComponent()
      expect(screen.getAllByText('+92%').length).toBeGreaterThan(0)
      expect(screen.getAllByText('+55%').length).toBeGreaterThan(0)
    })

    it('hides cost inflation section when data missing', () => {
      setupMocks({ assets: { ...mockAssetsData, cost_inflation: undefined } })
      renderComponent()
      expect(screen.queryByText('Construction Cost Inflation')).not.toBeInTheDocument()
    })
  })

  // --- Future Pressures ---

  describe('Future Pressures section', () => {
    it('renders future pressures section', () => {
      renderComponent()
      expect(screen.getByText('Future Pressures on the Network')).toBeInTheDocument()
    })

    it('shows population growth card', () => {
      renderComponent()
      expect(screen.getByText('Population Growth')).toBeInTheDocument()
      expect(screen.getByText('+5%')).toBeInTheDocument()
    })

    it('shows EV weight card', () => {
      renderComponent()
      expect(screen.getByText('Electric Vehicle Weight')).toBeInTheDocument()
      expect(screen.getByText('30% heavier')).toBeInTheDocument()
    })

    it('shows LGV growth card', () => {
      renderComponent()
      expect(screen.getByText('Light Goods Vehicle Growth')).toBeInTheDocument()
    })

    it('shows climate deterioration card', () => {
      renderComponent()
      expect(screen.getByText('Climate-Related Deterioration')).toBeInTheDocument()
    })

    it('shows autonomous vehicles card', () => {
      renderComponent()
      expect(screen.getByText('Autonomous Vehicles')).toBeInTheDocument()
    })

    it('shows motoring tax card', () => {
      renderComponent()
      expect(screen.getByText('Motoring Tax Revenue Pressure')).toBeInTheDocument()
    })

    it('hides future pressures when data missing', () => {
      setupMocks({ assets: { ...mockAssetsData, future_outlook: undefined } })
      renderComponent()
      expect(screen.queryByText('Future Pressures on the Network')).not.toBeInTheDocument()
    })
  })

  // --- Highways Spending Analysis ---

  describe('Highways Spending Analysis section', () => {
    it('renders spending analysis section', () => {
      renderComponent()
      expect(screen.getByText('Highways Spending Analysis')).toBeInTheDocument()
    })

    it('shows contractor names in table', () => {
      renderComponent()
      expect(screen.getByText('Lancashire Highways Ltd')).toBeInTheDocument()
      expect(screen.getByText('Tarmac Trading')).toBeInTheDocument()
    })

    it('shows concentration warning', () => {
      renderComponent()
      expect(screen.getByText(/Top contractor holds 43%/)).toBeInTheDocument()
    })

    it('hides spending section when no contractors', () => {
      setupMocks({ assets: { ...mockAssetsData, spending_integration: { top_contractors: [] } } })
      renderComponent()
      expect(screen.queryByText('Highways Spending Analysis')).not.toBeInTheDocument()
    })
  })

  // --- Highways Procurement Pipeline ---

  describe('Highways Procurement Pipeline section', () => {
    it('renders procurement pipeline section', () => {
      renderComponent()
      expect(screen.getByText('Highways Procurement Pipeline')).toBeInTheDocument()
    })

    it('shows LCC exercises in table', () => {
      renderComponent()
      expect(screen.getByText('A, B & C Road Resurfacing')).toBeInTheDocument()
      expect(screen.getByText('Unclassified Road Resurfacing')).toBeInTheDocument()
    })

    it('shows unitary contracts table', () => {
      renderComponent()
      expect(screen.getByText('Blackpool Highways Contract')).toBeInTheDocument()
    })

    it('shows geographic lotting risk warning', () => {
      renderComponent()
      expect(screen.getByText(/Geographic Lotting Risk/)).toBeInTheDocument()
    })

    it('shows LGR delay impact link', () => {
      renderComponent()
      expect(screen.getByText(/Full delay case analysis on LGR Tracker/)).toBeInTheDocument()
    })

    it('hides procurement section when pipeline data missing', () => {
      setupMocks({ procPipeline: null })
      // Need to re-mock useData for null pipeline
      useData.mockImplementation((url) => {
        if (Array.isArray(url)) return { data: [mockTrafficData, mockLegal, mockAssetsData], loading: false, error: null }
        return { data: null, loading: false, error: null }
      })
      renderComponent()
      expect(screen.queryByText('Highways Procurement Pipeline')).not.toBeInTheDocument()
    })
  })

  // --- Edge cases ---

  it('handles null traffic data gracefully', () => {
    setupMocks({ traffic: null })
    renderComponent()
    expect(screen.getByText(/Highways Department/)).toBeInTheDocument()
    // Infrastructure section should show placeholder
    expect(screen.getByText(/Infrastructure data being collected/)).toBeInTheDocument()
  })

  it('handles all null data gracefully (only highways enabled)', () => {
    setupMocks({ traffic: null, legal: null, assets: null })
    renderComponent()
    expect(screen.getByText(/Highways Department/)).toBeInTheDocument()
    // No sections should crash
    expect(screen.queryByText('Legal Framework')).not.toBeInTheDocument()
    expect(screen.queryByText('Assets & Investment')).not.toBeInTheDocument()
  })
})
