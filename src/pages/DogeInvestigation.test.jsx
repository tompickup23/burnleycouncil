import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DogeInvestigation from './DogeInvestigation'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

// Recharts uses browser APIs not available in jsdom; stub chart components
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="chart">{children}</div>,
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  PieChart: () => null,
  Pie: () => null,
  Cell: () => null,
  RadarChart: () => null,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null,
  Radar: () => null,
  ScatterChart: () => null,
  Scatter: () => null,
  ZAxis: () => null,
  Legend: () => null,
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
  data_sources: {},
  doge_context: {},
}

const mockData = [
  {
    findings: [{ id: 'F1', title: 'Test Finding', severity: 'high', category: 'duplicate', value: '£50K', label: 'Duplicate spend', detail: 'Test detail' }],
    key_findings: [],
    analyses_run: ['duplicates', 'splits', 'ch_compliance'],
    generated: '2025-01-01',
  },
  null,
  { summary: { total_spend: 150000000, transaction_count: 25000, unique_suppliers: 3000 } },
  { score: 85, checks: [], warnings: [], passed: 3, total_checks: 4 },
  [],
]

function renderComponent() {
  return render(
    <MemoryRouter>
      <DogeInvestigation />
    </MemoryRouter>
  )
}

describe('DogeInvestigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state while data loads', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading investigation data/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/unable to load investigation data/i)).toBeInTheDocument()
  })

  it('renders the page heading with data', () => {
    useData.mockReturnValue({ data: mockData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText(/DOGE Investigation/i)).toBeInTheDocument()
  })
})
