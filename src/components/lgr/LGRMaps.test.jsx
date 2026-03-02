import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LGRBoundaryMap from './LGRBoundaryMap'
import LGRDeprivationMap from './LGRDeprivationMap'

// Mock Recharts
vi.mock('recharts', () => ({
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  Cell: () => null,
  Legend: () => null,
}))

// Mock WardMap — just return a div (Leaflet does not work in JSDOM)
vi.mock('../WardMap', () => ({ default: (props) => <div data-testid="ward-map" data-height={props.height}>Map</div> }))

// ── Test fixtures ──

const mockBoundaries = {
  features: [
    { properties: { name: 'Burnley Central', centroid: [-2.25, 53.78] }, geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] } },
    { properties: { name: 'Padiham', centroid: [-2.31, 53.80] }, geometry: { type: 'Polygon', coordinates: [[[1,1],[2,1],[2,2],[1,2],[1,1]]] } },
    { properties: { name: 'Brierfield', centroid: [-2.24, 53.82] }, geometry: { type: 'Polygon', coordinates: [[[2,2],[3,2],[3,3],[2,3],[2,2]]] } },
  ],
}

const mockAuthorities = [
  { name: 'Pennine Lancashire', authority_name: 'Pennine Lancashire', councils: ['burnley', 'pendle'], wards: ['Burnley Central', 'Padiham'] },
  { name: 'Central Lancashire', authority_name: 'Central Lancashire', councils: ['preston', 'chorley'], wards: ['Brierfield'] },
]

const mockFiscalProfile = [
  {
    authority: 'Pennine Lancashire',
    population: 560000,
    dependency_ratio: 64.5,
    service_demand_pressure_score: 74,
    muslim_pct: 19.4,
    under_16_pct: 20.3,
    avg_imd_score: 35.2,
    wards_in_decile_1_2_pct: 42,
  },
  {
    authority: 'Central Lancashire',
    population: 480000,
    dependency_ratio: 58.0,
    service_demand_pressure_score: 60,
    muslim_pct: 5.5,
    under_16_pct: 18.1,
    avg_imd_score: 22.0,
    wards_in_decile_1_2_pct: 15,
  },
]

const mockDeprivation = {
  'Burnley Central': { imd_score: 45.3 },
  'Padiham': { imd_score: 28.1 },
  'Brierfield': { imd_score: 38.7 },
}

const mockPropertyAssets = [
  { id: 'p1', name: 'County Hall', lat: 53.76, lng: -2.70, category: 'office_civic', linked_supplier_spend_total: 500000 },
  { id: 'p2', name: 'Burnley Library', lat: 53.78, lng: -2.25, category: 'library' },
]

// ═══════════════════════════════════════════════════════════════════════
// LGRBoundaryMap tests
// ═══════════════════════════════════════════════════════════════════════

describe('LGRBoundaryMap', () => {
  it('returns null when boundaries missing', () => {
    const { container } = render(
      <LGRBoundaryMap boundaries={null} authorities={mockAuthorities} fiscalProfile={mockFiscalProfile} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when boundaries has no features', () => {
    const { container } = render(
      <LGRBoundaryMap boundaries={{ features: [] }} authorities={mockAuthorities} fiscalProfile={mockFiscalProfile} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders overlay mode tabs', () => {
    render(
      <LGRBoundaryMap boundaries={mockBoundaries} authorities={mockAuthorities} fiscalProfile={mockFiscalProfile} />
    )
    expect(screen.getByText('LGR Authority')).toBeInTheDocument()
    expect(screen.getByText('Deprivation Heat')).toBeInTheDocument()
    expect(screen.getByText('Demographic Pressure')).toBeInTheDocument()
    expect(screen.getByText('Property Locations')).toBeInTheDocument()
  })

  it('renders WardMap component', async () => {
    render(
      <LGRBoundaryMap boundaries={mockBoundaries} authorities={mockAuthorities} fiscalProfile={mockFiscalProfile} />
    )
    expect(await screen.findByTestId('ward-map')).toBeInTheDocument()
  })

  it('shows legend for authority mode by default', () => {
    render(
      <LGRBoundaryMap boundaries={mockBoundaries} authorities={mockAuthorities} fiscalProfile={mockFiscalProfile} />
    )
    expect(screen.getByText('Legend')).toBeInTheDocument()
    // Authority names appear in both legend and stats grid — use getAllByText
    expect(screen.getAllByText('Pennine Lancashire').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Central Lancashire').length).toBeGreaterThanOrEqual(1)
  })

  it('switches overlay mode on tab click', () => {
    render(
      <LGRBoundaryMap
        boundaries={mockBoundaries}
        authorities={mockAuthorities}
        fiscalProfile={mockFiscalProfile}
        deprivation={mockDeprivation}
      />
    )
    // Click deprivation tab
    fireEvent.click(screen.getByText('Deprivation Heat'))
    // Legend should change
    expect(screen.getByText('Least deprived')).toBeInTheDocument()
    expect(screen.getByText('Most deprived')).toBeInTheDocument()
  })

  it('shows demographic pressure legend when tab selected', () => {
    render(
      <LGRBoundaryMap boundaries={mockBoundaries} authorities={mockAuthorities} fiscalProfile={mockFiscalProfile} />
    )
    fireEvent.click(screen.getByText('Demographic Pressure'))
    expect(screen.getByText('Low pressure')).toBeInTheDocument()
    expect(screen.getByText('High pressure')).toBeInTheDocument()
  })

  it('shows property legend when tab selected', () => {
    render(
      <LGRBoundaryMap
        boundaries={mockBoundaries}
        authorities={mockAuthorities}
        fiscalProfile={mockFiscalProfile}
        propertyAssets={mockPropertyAssets}
      />
    )
    fireEvent.click(screen.getByText('Property Locations'))
    expect(screen.getByText('Property asset')).toBeInTheDocument()
  })

  it('shows authority stats in authority mode with fiscal profile', () => {
    render(
      <LGRBoundaryMap boundaries={mockBoundaries} authorities={mockAuthorities} fiscalProfile={mockFiscalProfile} />
    )
    // Stats should show population values
    expect(screen.getByText('560,000')).toBeInTheDocument()
    expect(screen.getByText('480,000')).toBeInTheDocument()
  })

  it('has correct aria attributes', () => {
    render(
      <LGRBoundaryMap boundaries={mockBoundaries} authorities={mockAuthorities} fiscalProfile={mockFiscalProfile} />
    )
    expect(screen.getByRole('region', { name: 'LGR Boundary Map' })).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Map overlay mode' })).toBeInTheDocument()
  })

  it('marks active tab with aria-selected', () => {
    render(
      <LGRBoundaryMap boundaries={mockBoundaries} authorities={mockAuthorities} fiscalProfile={mockFiscalProfile} />
    )
    const authorityTab = screen.getByText('LGR Authority').closest('[role="tab"]')
    expect(authorityTab).toHaveAttribute('aria-selected', 'true')
    const deprivationTab = screen.getByText('Deprivation Heat').closest('[role="tab"]')
    expect(deprivationTab).toHaveAttribute('aria-selected', 'false')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// LGRDeprivationMap tests
// ═══════════════════════════════════════════════════════════════════════

describe('LGRDeprivationMap', () => {
  it('returns null when fiscal profile missing', () => {
    const { container } = render(
      <LGRDeprivationMap fiscalProfile={null} selectedModel="three_unitary" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when fiscal profile is empty array', () => {
    const { container } = render(
      <LGRDeprivationMap fiscalProfile={[]} selectedModel="three_unitary" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders deprivation comparison panel', () => {
    render(
      <LGRDeprivationMap fiscalProfile={mockFiscalProfile} selectedModel="three_unitary" />
    )
    expect(screen.getByText('Deprivation by Authority')).toBeInTheDocument()
  })

  it('shows per-authority IMD cards', () => {
    render(
      <LGRDeprivationMap fiscalProfile={mockFiscalProfile} selectedModel="three_unitary" />
    )
    // Authority names shortened in cards
    expect(screen.getByText('Pennine Lancashire')).toBeInTheDocument()
    expect(screen.getByText('Central Lancashire')).toBeInTheDocument()
    expect(screen.getByText('IMD 35.2')).toBeInTheDocument()
    expect(screen.getByText('IMD 22.0')).toBeInTheDocument()
  })

  it('shows adjusted savings when grossSavings provided', () => {
    render(
      <LGRDeprivationMap
        fiscalProfile={mockFiscalProfile}
        selectedModel="three_unitary"
        grossSavings={50000000}
      />
    )
    expect(screen.getByText('Deprivation-Adjusted Savings')).toBeInTheDocument()
    expect(screen.getByText('Gross Savings')).toBeInTheDocument()
    expect(screen.getByText('Adjusted Savings')).toBeInTheDocument()
    expect(screen.getByText('Reduction')).toBeInTheDocument()
  })

  it('shows adjustment factor descriptions', () => {
    render(
      <LGRDeprivationMap
        fiscalProfile={mockFiscalProfile}
        selectedModel="three_unitary"
        grossSavings={50000000}
      />
    )
    // adjustSavingsForDeprivation produces factors like "High deprivation (IMD 35.2) → 25% savings reduction"
    const factorRegex = /deprivation/i
    const factors = screen.getAllByText(factorRegex)
    expect(factors.length).toBeGreaterThan(0)
  })

  it('shows empty state when no IMD data and no savings', () => {
    const profileNoImd = [
      { authority: 'Test Auth', population: 100000 },
    ]
    render(
      <LGRDeprivationMap fiscalProfile={profileNoImd} selectedModel="test" />
    )
    expect(screen.getByText(/Deprivation data not available/)).toBeInTheDocument()
  })

  it('renders bar chart for IMD comparison', () => {
    render(
      <LGRDeprivationMap fiscalProfile={mockFiscalProfile} selectedModel="three_unitary" />
    )
    expect(screen.getAllByTestId('bar-chart').length).toBeGreaterThan(0)
  })

  it('has correct aria region', () => {
    render(
      <LGRDeprivationMap fiscalProfile={mockFiscalProfile} selectedModel="three_unitary" />
    )
    expect(screen.getByRole('region', { name: 'LGR Deprivation Analysis' })).toBeInTheDocument()
  })

  it('does not render savings panel when grossSavings is zero', () => {
    render(
      <LGRDeprivationMap
        fiscalProfile={mockFiscalProfile}
        selectedModel="three_unitary"
        grossSavings={0}
      />
    )
    expect(screen.queryByText('Deprivation-Adjusted Savings')).not.toBeInTheDocument()
  })

  it('shows population in IMD cards', () => {
    render(
      <LGRDeprivationMap fiscalProfile={mockFiscalProfile} selectedModel="three_unitary" />
    )
    expect(screen.getByText('Pop: 560,000')).toBeInTheDocument()
    expect(screen.getByText('Pop: 480,000')).toBeInTheDocument()
  })
})
