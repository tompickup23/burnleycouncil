import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import LGRPropertyDivision from './LGRPropertyDivision'
import LGRCCAImpact from './LGRCCAImpact'

// Mock recharts — SVG measurement doesn't work in JSDOM
vi.mock('recharts', () => {
  const MockChart = ({ children }) => <div data-testid="recharts-mock">{children}</div>
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    BarChart: MockChart, Bar: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null, Cell: () => null, Legend: () => null,
  }
})

// ── Test data ──

const mockPropertyData = {
  two_unitary: {
    'North Lancashire': {
      assets_count: 520,
      estimated_value: 290000000,
      rb_market_value: 494000000,
      rb_euv: 487000000,
      categories: { 'Office': 80, 'School': 200, 'Depot': 40, 'Leisure': 50, 'Other': 150 },
      condition_backlog: 28000000,
      disposal_candidates: 145,
      revenue_generating: 48,
      cost_centres: 472,
      ownership_tiers: { county: 517, third_party: 3 },
      ownership_tier_values: { county: 289850000, third_party: 150000 },
      subsidiaries: { 'Lancashire County Developments (Property) Limited': 8 },
      subsidiary_values: { 'Lancashire County Developments (Property) Limited': 4500000 },
    },
    'South Lancashire': {
      assets_count: 680,
      estimated_value: 585000000,
      rb_market_value: 935000000,
      rb_euv: 913000000,
      categories: { 'Office': 110, 'School': 280, 'Depot': 55, 'Leisure': 70, 'Other': 165 },
      condition_backlog: 28600000,
      disposal_candidates: 199,
      revenue_generating: 62,
      cost_centres: 618,
      ownership_tiers: { county: 678, third_party: 2 },
      ownership_tier_values: { county: 584900000, third_party: 100000 },
      subsidiaries: { 'Lancashire County Developments (Property) Limited': 5, 'Lancashire Renewables Limited': 2 },
      subsidiary_values: { 'Lancashire County Developments (Property) Limited': 2800000, 'Lancashire Renewables Limited': 1200000 },
    },
  },
  contested_assets: [
    { name: 'County Hall Complex', description: 'Sits on North/South boundary' },
    { name: 'Lancashire Fire HQ', description: 'Serves both authorities' },
  ],
}

const mockModels = [
  { id: 'two_unitary', name: '2-Unitary' },
  { id: 'three_unitary', name: '3-Unitary' },
]

const mockCCAData = {
  transfers: [
    { service: 'Transport', amount: 86000000, description: 'Bus services and highways maintenance' },
    { service: 'Skills & Training', amount: 41000000, description: 'Adult education and apprenticeships' },
    { service: 'Economic Development', amount: 39000000, description: 'Business grants and inward investment' },
  ],
  total_transferred: 166000000,
  deduction_from_savings: 24000000,
}

// ── LGRPropertyDivision ──

describe('LGRPropertyDivision', () => {
  it('returns null when no property data', () => {
    const { container } = render(
      <LGRPropertyDivision propertyData={null} selectedModel="two_unitary" models={mockModels} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('returns null when selected model not in data', () => {
    const { container } = render(
      <LGRPropertyDivision propertyData={mockPropertyData} selectedModel="five_unitary" models={mockModels} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows authority asset counts', () => {
    render(
      <LGRPropertyDivision
        propertyData={mockPropertyData}
        selectedModel="two_unitary"
        models={mockModels}
      />
    )
    expect(screen.getByText('Property Estate Division')).toBeInTheDocument()
    // Authority names appear in both stats grid and disposal grid — use getAllByText
    expect(screen.getAllByText('North Lancashire').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('South Lancashire').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('520')).toBeInTheDocument()
    expect(screen.getByText('680')).toBeInTheDocument()
  })

  it('shows total assets in description', () => {
    render(
      <LGRPropertyDivision
        propertyData={mockPropertyData}
        selectedModel="two_unitary"
        models={mockModels}
      />
    )
    // 520 + 680 = 1,200
    expect(screen.getByText(/1,200/)).toBeInTheDocument()
    expect(screen.getByText(/2-Unitary/)).toBeInTheDocument()
  })

  it('shows disposal candidates warning', () => {
    render(
      <LGRPropertyDivision
        propertyData={mockPropertyData}
        selectedModel="two_unitary"
        models={mockModels}
      />
    )
    expect(screen.getByText('Disposal Candidates')).toBeInTheDocument()
    // 145 + 199 = 344
    expect(screen.getByText(/344/)).toBeInTheDocument()
  })

  it('shows contested assets panel', () => {
    render(
      <LGRPropertyDivision
        propertyData={mockPropertyData}
        selectedModel="two_unitary"
        models={mockModels}
      />
    )
    expect(screen.getByText('Contested Assets')).toBeInTheDocument()
    expect(screen.getByText('County Hall Complex')).toBeInTheDocument()
    expect(screen.getByText('Lancashire Fire HQ')).toBeInTheDocument()
  })

  it('handles contested_assets as count object', () => {
    const data = {
      ...mockPropertyData,
      contested_assets: { count: 12 },
    }
    render(
      <LGRPropertyDivision propertyData={data} selectedModel="two_unitary" models={mockModels} />
    )
    expect(screen.getByText('Contested Assets')).toBeInTheDocument()
    expect(screen.getByText(/12 assets/)).toBeInTheDocument()
  })

  it('renders chart sections', () => {
    render(
      <LGRPropertyDivision
        propertyData={mockPropertyData}
        selectedModel="two_unitary"
        models={mockModels}
      />
    )
    expect(screen.getByText('Assets by Category')).toBeInTheDocument()
    expect(screen.getByText('Condition Backlog by Authority')).toBeInTheDocument()
  })

  it('shows estate valuations section', () => {
    render(
      <LGRPropertyDivision
        propertyData={mockPropertyData}
        selectedModel="two_unitary"
        models={mockModels}
      />
    )
    expect(screen.getByText('Estate Valuations by Authority')).toBeInTheDocument()
    expect(screen.getAllByText(/Red Book/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows ownership tier breakdown', () => {
    render(
      <LGRPropertyDivision
        propertyData={mockPropertyData}
        selectedModel="two_unitary"
        models={mockModels}
      />
    )
    expect(screen.getByText('Ownership Tier Breakdown')).toBeInTheDocument()
  })

  it('shows subsidiary assets', () => {
    render(
      <LGRPropertyDivision
        propertyData={mockPropertyData}
        selectedModel="two_unitary"
        models={mockModels}
      />
    )
    expect(screen.getAllByText(/Subsidiary/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Lancashire County Developments/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Lancashire Renewables/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows revenue-generating count', () => {
    render(
      <LGRPropertyDivision
        propertyData={mockPropertyData}
        selectedModel="two_unitary"
        models={mockModels}
      />
    )
    // 48 + 62 = 110 revenue-generating assets
    expect(screen.getByText(/48 revenue/)).toBeInTheDocument()
    expect(screen.getByText(/62 revenue/)).toBeInTheDocument()
  })
})

// ── LGRCCAImpact ──

describe('LGRCCAImpact', () => {
  it('returns null when no CCA data', () => {
    const { container } = render(<LGRCCAImpact ccaData={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('returns null when no transfers and no total', () => {
    const { container } = render(
      <LGRCCAImpact ccaData={{ transfers: [], total_transferred: 0 }} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows double-counting warning', () => {
    render(<LGRCCAImpact ccaData={mockCCAData} />)
    expect(screen.getByText('Double-Counting Risk')).toBeInTheDocument()
    expect(screen.getByText(/already been transferred/)).toBeInTheDocument()
  })

  it('shows transfer table with services', () => {
    render(<LGRCCAImpact ccaData={mockCCAData} />)
    expect(screen.getByText('Transport')).toBeInTheDocument()
    expect(screen.getByText('Skills & Training')).toBeInTheDocument()
    expect(screen.getByText('Economic Development')).toBeInTheDocument()
  })

  it('shows transfer total', () => {
    render(<LGRCCAImpact ccaData={mockCCAData} />)
    expect(screen.getByText('Total Already at CCA Level')).toBeInTheDocument()
    // £166M
    expect(screen.getByText(/166/)).toBeInTheDocument()
  })

  it('shows deduction card when deduction present', () => {
    render(<LGRCCAImpact ccaData={mockCCAData} />)
    expect(screen.getByText('Required Deduction from LGR Savings')).toBeInTheDocument()
    // -£24M
    expect(screen.getByText(/-.*24/)).toBeInTheDocument()
  })

  it('hides deduction card when no deduction', () => {
    const data = { ...mockCCAData, deduction_from_savings: 0 }
    render(<LGRCCAImpact ccaData={data} />)
    expect(screen.queryByText('Required Deduction from LGR Savings')).not.toBeInTheDocument()
  })

  it('shows CCA footnote', () => {
    render(<LGRCCAImpact ccaData={mockCCAData} />)
    expect(screen.getByText(/must subtract CCA-transferred/)).toBeInTheDocument()
  })

  it('renders chart section', () => {
    render(<LGRCCAImpact ccaData={mockCCAData} />)
    // Chart mock renders
    expect(screen.getAllByTestId('recharts-mock').length).toBeGreaterThan(0)
  })
})
