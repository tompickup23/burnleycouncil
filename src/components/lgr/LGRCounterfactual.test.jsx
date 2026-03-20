import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LGRCounterfactual from './LGRCounterfactual'

const mockComparison = {
  lgrPath: [
    { year: 'Y-1', yearNum: -1, rawNet: -60000000, hiddenCosts: -72000000, adjustedNet: -132000000, cumulative: -132000000, npv: -132000000 },
    { year: 'Y1', yearNum: 1, rawNet: -20000000, hiddenCosts: -72000000, adjustedNet: -92000000, cumulative: -224000000, npv: -220000000 },
    { year: 'Y5', yearNum: 5, rawNet: 25000000, hiddenCosts: 0, adjustedNet: 25000000, cumulative: -100000000, npv: -80000000 },
  ],
  statusQuoPath: [
    { year: 'Y-1', yearNum: -1, savings: 0, cumulative: 0, npv: 0 },
    { year: 'Y1', yearNum: 1, savings: 19200000, cumulative: 19200000, npv: 18500000 },
    { year: 'Y5', yearNum: 5, savings: 22000000, cumulative: 100000000, npv: 85000000 },
  ],
  netIncrementalBenefit: -165000000,
  breakEvenYear: null,
  lgrNPV: -80000000,
  sqNPV: 85000000,
  hiddenCosts: {
    distraction: 177300000,
    opportunity: 95200000,
    serviceFailure: 15500000,
    total: 288000000,
  },
  verdict: 'Status quo delivers better value — LGR net benefit is negative after accounting for hidden costs',
  factors: ['LGR 10-year NPV: -£80M', 'Status quo 10-year NPV: £85M'],
}

const mockStatusQuo = {
  annualSteadyState: 23200000,
  tenYearTotal: 205600000,
  yearlyProfile: [{ year: 1, total: 19200000, cumulative: 19200000 }],
  factors: ['Base NRE: £1,324M'],
}

describe('LGRCounterfactual', () => {
  it('returns null when comparison is null', () => {
    const { container } = render(<LGRCounterfactual comparison={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders verdict banner', () => {
    render(<LGRCounterfactual comparison={mockComparison} statusQuoSavings={mockStatusQuo} />)
    expect(screen.getByText('Verdict')).toBeInTheDocument()
    expect(screen.getByText(/Status quo delivers better value/)).toBeInTheDocument()
  })

  it('renders negative verdict with correct styling', () => {
    render(<LGRCounterfactual comparison={mockComparison} statusQuoSavings={mockStatusQuo} />)
    const verdict = screen.getByRole('alert')
    expect(verdict.className).toContain('verdict-negative')
  })

  it('renders stat cards with NPV values', () => {
    render(<LGRCounterfactual comparison={mockComparison} statusQuoSavings={mockStatusQuo} />)
    expect(screen.getByText('LGR 10yr NPV')).toBeInTheDocument()
    expect(screen.getByText('Status Quo 10yr NPV')).toBeInTheDocument()
    expect(screen.getByText('Net LGR Benefit')).toBeInTheDocument()
    expect(screen.getByText('LGR Breakeven')).toBeInTheDocument()
  })

  it('shows "Never" when breakeven is null', () => {
    render(<LGRCounterfactual comparison={mockComparison} statusQuoSavings={mockStatusQuo} />)
    expect(screen.getByText('Never')).toBeInTheDocument()
  })

  it('renders hidden costs breakdown', () => {
    render(<LGRCounterfactual comparison={mockComparison} statusQuoSavings={mockStatusQuo} />)
    expect(screen.getByText(/Hidden Costs Ignored/)).toBeInTheDocument()
  })

  it('renders evidence factors', () => {
    render(<LGRCounterfactual comparison={mockComparison} statusQuoSavings={mockStatusQuo} />)
    expect(screen.getByText('Analysis Methodology')).toBeInTheDocument()
  })

  it('renders status quo evidence', () => {
    render(<LGRCounterfactual comparison={mockComparison} statusQuoSavings={mockStatusQuo} />)
    expect(screen.getByText('Status Quo Evidence Base')).toBeInTheDocument()
  })

  it('renders positive verdict styling correctly', () => {
    const positiveComparison = {
      ...mockComparison,
      netIncrementalBenefit: 200000000,
      verdict: 'LGR delivers clear net benefit over status quo',
    }
    render(<LGRCounterfactual comparison={positiveComparison} statusQuoSavings={mockStatusQuo} />)
    const verdict = screen.getByRole('alert')
    expect(verdict.className).toContain('verdict-positive')
  })
})
