import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import LGRTimelineChaos from './LGRTimelineChaos'

// Mock Recharts (SVG not measurable in JSDOM)
vi.mock('recharts', () => {
  const MockChart = ({ children }) => <div data-testid="recharts-mock">{children}</div>
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    BarChart: MockChart,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Cell: () => null,
  }
})

// Mock lgrModel — computeTimelineFeasibility passes through timeline data
vi.mock('../../utils/lgrModel', () => ({
  computeTimelineFeasibility: vi.fn((timeline) => {
    if (!timeline) return {
      score: 0, verdict: 'No Data', riskFactors: [], precedents: [],
      costOverrun: {}, monthsAvailable: 0, monthsShortfall: 0,
    }
    return {
      score: timeline.feasibility_score || 0,
      verdict: timeline.verdict || 'Unknown',
      riskFactors: timeline.risk_factors || [],
      precedents: timeline.precedents || [],
      costOverrun: timeline.cost_overrun_analysis || {},
      monthsAvailable: timeline.months_available || 0,
      monthsShortfall: timeline.months_shortfall || 0,
      lancashireComplexity: timeline.lancashire_complexity || {},
      precedentAvgMonths: timeline.precedent_average_months || 0,
    }
  }),
}))

const mockTimeline = {
  feasibility_score: 0,
  verdict: 'Very High Risk',
  months_available: 22,
  precedent_average_months: 31,
  lancashire_complexity: {
    population: 1530000,
    councils: 15,
    staff: 30000,
  },
  precedents: [
    { name: 'Buckinghamshire', population: 546000, councils_merged: 5, months: 30, on_budget: true, lessons_learned: 'Strong programme office' },
    { name: 'Dorset', population: 380000, councils_merged: 6, months: 30, on_budget: true, lessons_learned: 'Rural geography added complexity' },
    { name: 'North Yorkshire', population: 615000, councils_merged: 8, months: 36, on_budget: false, lessons_learned: 'Largest by area' },
    { name: 'Northamptonshire', population: 760000, councils_merged: 7, months: 28, on_budget: false, lessons_learned: 'Financial crisis drove merger' },
  ],
  risk_factors: [
    { severity: 'critical', description: 'No UK precedent for merging 15 councils simultaneously' },
    { severity: 'high', description: 'IT migration typically requires 24+ months alone' },
    { severity: 'medium', description: 'TUPE consultation for 30,000+ staff requires minimum 6 months' },
  ],
  cost_overrun_analysis: {
    median_overrun_pct: 35,
    on_time_probability_pct: 8,
  },
}

describe('LGRTimelineChaos', () => {
  it('renders null when no timeline data', () => {
    const { container } = render(<LGRTimelineChaos timeline={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows feasibility score and verdict', () => {
    render(<LGRTimelineChaos timeline={mockTimeline} />)
    const gauge = screen.getByRole('img', { name: /feasibility score/i })
    expect(gauge).toBeTruthy()
    expect(screen.getByText('Very High Risk')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy() // score value in SVG
  })

  it('shows key stat cards', () => {
    render(<LGRTimelineChaos timeline={mockTimeline} />)
    const statsGrid = screen.getByRole('list', { name: /key timeline/i })
    expect(statsGrid).toBeTruthy()
    const items = within(statsGrid).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(within(statsGrid).getByText('Months Available')).toBeTruthy()
    expect(within(statsGrid).getByText('Councils to Merge')).toBeTruthy()
    expect(within(statsGrid).getByText('Population')).toBeTruthy()
    expect(within(statsGrid).getByText('Staff under TUPE')).toBeTruthy()
  })

  it('shows precedent comparison table', () => {
    render(<LGRTimelineChaos timeline={mockTimeline} />)
    const table = screen.getByRole('table', { name: /precedent/i })
    expect(table).toBeTruthy()

    // Check precedent rows
    expect(screen.getByText('Buckinghamshire')).toBeTruthy()
    expect(screen.getByText('Dorset')).toBeTruthy()
    expect(screen.getByText('North Yorkshire')).toBeTruthy()
    expect(screen.getByText('Northamptonshire')).toBeTruthy()

    // Check Lancashire row
    const lancRow = screen.getByText('Lancashire (proposed)').closest('tr')
    expect(lancRow).toBeTruthy()
    expect(within(lancRow).getByText('TBD')).toBeTruthy()
  })

  it('shows risk factors with severity indicators', () => {
    render(<LGRTimelineChaos timeline={mockTimeline} />)
    const riskList = screen.getByRole('list', { name: /risk factors/i })
    expect(riskList).toBeTruthy()

    const items = within(riskList).getAllByRole('listitem')
    expect(items).toHaveLength(3)

    expect(screen.getByText(/No UK precedent for merging 15 councils/)).toBeTruthy()
    expect(screen.getByText(/IT migration typically requires 24\+ months/)).toBeTruthy()
    expect(screen.getByText(/TUPE consultation for 30,000\+ staff/)).toBeTruthy()
  })

  it('shows cost overrun analysis', () => {
    render(<LGRTimelineChaos timeline={mockTimeline} />)
    expect(screen.getByText('35%')).toBeTruthy()
    expect(screen.getByText('Historical Median Overrun')).toBeTruthy()
    expect(screen.getByText('8%')).toBeTruthy()
    expect(screen.getByText('On-Time Probability')).toBeTruthy()
  })

  it('shows service continuity risk cards', () => {
    render(<LGRTimelineChaos timeline={mockTimeline} />)
    const serviceList = screen.getByRole('list', { name: /service continuity/i })
    expect(serviceList).toBeTruthy()

    const cards = within(serviceList).getAllByRole('listitem')
    expect(cards).toHaveLength(4)

    expect(screen.getByText("Children's Services")).toBeTruthy()
    expect(screen.getByText('Adult Social Care')).toBeTruthy()
    expect(screen.getByText('Education & SEND')).toBeTruthy()
    expect(screen.getByText('Highways & Waste')).toBeTruthy()
  })

  it('shows selectedModel tag when provided', () => {
    render(<LGRTimelineChaos timeline={mockTimeline} selectedModel="Two Unitary" />)
    expect(screen.getByText('Two Unitary')).toBeTruthy()
  })

  it('handles string-only risk factors', () => {
    const timeline = {
      ...mockTimeline,
      risk_factors: ['Risk one', 'Risk two'],
    }
    render(<LGRTimelineChaos timeline={timeline} />)
    expect(screen.getByText('Risk one')).toBeTruthy()
    expect(screen.getByText('Risk two')).toBeTruthy()
  })

  it('uses default precedents when none provided', () => {
    const timeline = { ...mockTimeline, precedents: [] }
    render(<LGRTimelineChaos timeline={timeline} />)
    // Should still show the default precedents
    expect(screen.getByText('Buckinghamshire')).toBeTruthy()
    expect(screen.getByText('Dorset')).toBeTruthy()
  })

  it('shows month shortfall calculation', () => {
    render(<LGRTimelineChaos timeline={mockTimeline} />)
    // 31 - 22 = 9 month shortfall
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.getByText('Month Shortfall vs Precedent')).toBeTruthy()
  })
})
