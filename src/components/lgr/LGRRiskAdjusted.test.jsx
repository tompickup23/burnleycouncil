import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LGRRiskAdjusted from './LGRRiskAdjusted'

const mockRiskAdjusted = {
  cashflow: [
    { year: 'Y-1', yearNum: -1, net: -80000000, cumulative: -80000000, npv: -80000000 },
    { year: 'Y1', yearNum: 1, net: -30000000, cumulative: -110000000, npv: -108000000 },
    { year: 'Y5', yearNum: 5, net: 15000000, cumulative: -50000000, npv: -45000000 },
  ],
  adjustments: {
    realisationRate: 0.65,
    deprivationMultiplier: 0.75,
    timelineProbability: 0.20,
    distractionLoss: 177300000,
    serviceFailureCost: 15500000,
  },
  npv: -45000000,
  breakeven: null,
  factors: ['DOGE-adjusted realisation: 65%', 'Risk-adjusted 10-year NPV: -£45M'],
}

const mockBaseCashflow = [
  { year: 'Y-1', yearNum: -1, costs: -50000000, savings: 0, net: -50000000, cumulative: -50000000, npv: -50000000 },
  { year: 'Y1', yearNum: 1, costs: -30000000, savings: 10000000, net: -20000000, cumulative: -70000000, npv: -68000000 },
  { year: 'Y5', yearNum: 5, costs: 0, savings: 25000000, net: 25000000, cumulative: 30000000, npv: 20000000 },
]

describe('LGRRiskAdjusted', () => {
  it('returns null when riskAdjusted is null', () => {
    const { container } = render(<LGRRiskAdjusted riskAdjusted={null} baseCashflow={mockBaseCashflow} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders stat cards', () => {
    render(<LGRRiskAdjusted riskAdjusted={mockRiskAdjusted} baseCashflow={mockBaseCashflow} />)
    expect(screen.getByText('Risk-Adjusted NPV')).toBeInTheDocument()
    expect(screen.getByText('Risk-Adjusted Breakeven')).toBeInTheDocument()
    expect(screen.getByText('Headline vs Adjusted Gap')).toBeInTheDocument()
  })

  it('shows "Never" when breakeven is null', () => {
    render(<LGRRiskAdjusted riskAdjusted={mockRiskAdjusted} baseCashflow={mockBaseCashflow} />)
    expect(screen.getByText('Never')).toBeInTheDocument()
  })

  it('renders waterfall chart section', () => {
    render(<LGRRiskAdjusted riskAdjusted={mockRiskAdjusted} baseCashflow={mockBaseCashflow} />)
    expect(screen.getByText('NPV Adjustment Waterfall')).toBeInTheDocument()
  })

  it('renders dual-line comparison chart', () => {
    render(<LGRRiskAdjusted riskAdjusted={mockRiskAdjusted} baseCashflow={mockBaseCashflow} />)
    expect(screen.getByText('Cumulative Cashflow: Headline vs Risk-Adjusted')).toBeInTheDocument()
  })

  it('renders adjustment annotations', () => {
    render(<LGRRiskAdjusted riskAdjusted={mockRiskAdjusted} baseCashflow={mockBaseCashflow} />)
    expect(screen.getByText('Applied Adjustments')).toBeInTheDocument()
    expect(screen.getByText('Savings Realisation')).toBeInTheDocument()
    expect(screen.getByText('65%')).toBeInTheDocument()
    expect(screen.getByText('Deprivation Multiplier')).toBeInTheDocument()
    expect(screen.getByText('On-Time Probability')).toBeInTheDocument()
    expect(screen.getByText('20%')).toBeInTheDocument()
  })

  it('renders cross-reference links', () => {
    render(<LGRRiskAdjusted riskAdjusted={mockRiskAdjusted} baseCashflow={mockBaseCashflow} />)
    expect(screen.getByText(/See Deprivation section/)).toBeInTheDocument()
    expect(screen.getByText(/See Timeline Risk/)).toBeInTheDocument()
    expect(screen.getByText(/See Hidden Costs/)).toBeInTheDocument()
  })

  it('renders breakeven comparison', () => {
    render(<LGRRiskAdjusted riskAdjusted={mockRiskAdjusted} baseCashflow={mockBaseCashflow} />)
    expect(screen.getByText(/Never reaches breakeven/)).toBeInTheDocument()
  })

  it('renders evidence factors', () => {
    render(<LGRRiskAdjusted riskAdjusted={mockRiskAdjusted} baseCashflow={mockBaseCashflow} />)
    expect(screen.getByText(/DOGE-adjusted realisation: 65%/)).toBeInTheDocument()
  })
})
