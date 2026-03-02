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
      total_assets: 520,
      categories: { 'Office': 80, 'School': 200, 'Depot': 40, 'Leisure': 50, 'Other': 150 },
      condition_backlog: 28000000,
      disposal_candidates: 145,
    },
    'South Lancashire': {
      total_assets: 680,
      categories: { 'Office': 110, 'School': 280, 'Depot': 55, 'Leisure': 70, 'Other': 165 },
      condition_backlog: 28600000,
      disposal_candidates: 199,
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
