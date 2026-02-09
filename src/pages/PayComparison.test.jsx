import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PayComparison from './PayComparison'

// Mock hooks
vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

// Recharts uses browser APIs not available in jsdom; stub chart components
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="chart">{children}</div>,
  LineChart: () => null,
  BarChart: () => null,
  Bar: () => null,
  Cell: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  data_sources: { pay_comparison: true },
}

const mockPayData = {
  chief_executive: {
    name: 'Lukman Patel',
    title: 'Chief Executive',
    appointed: 'November 2023',
    salary_type: 'spot',
    salary: 113001,
    background: 'Test background text.',
  },
  pay_history: [
    { year: '2022/23', ceo_salary: 112000, ceo_total_remuneration: 144000, median_employee_salary: 26000, ceo_to_median_ratio: 5.5, ceo_to_lowest_ratio: 6.5 },
    { year: '2023/24', ceo_salary: 113001, ceo_total_remuneration: 148000, median_employee_salary: 27000, ceo_to_median_ratio: 5.4, ceo_to_lowest_ratio: 6.3 },
  ],
  senior_officers: [
    { post: 'Chief Operating Officer', salary_band: '£90,000-£98,000', midpoint: 94000 },
    { post: 'Head of Legal', salary_band: '£70,000-£78,000', midpoint: 74000 },
  ],
  comparators: [
    { council: 'Burnley', ceo_salary_midpoint: 113001, ceo_to_median_ratio: 5.4, population: 73000, type: 'District' },
    { council: 'Hyndburn', ceo_salary_midpoint: 145800, ceo_to_median_ratio: 4.5, population: 81000, type: 'District' },
  ],
  national_context: { recommended_max_ratio: 20, district_ceo_average: 120000 },
  tpa_town_hall_rich_list: {
    '2022_23': { employees_over_100k: 2 },
    '2023_24': { employees_over_100k: 0, note: 'Dual part-year CEOs' },
  },
  gender_pay_gap: {
    reports_required: false,
    reason: 'Fewer than 250 employees.',
    note: 'Exempt from mandatory reporting.',
  },
  employee_headcount: { band: '<250' },
  councillor_allowances: {
    basic_allowance: 4634,
    total_councillors: 45,
    key_sras: { leader: 21594 },
  },
  note: 'From Pay Policy Statements.',
  source: 'Pay Policy Statements',
  last_updated: '2026-02-09',
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <PayComparison />
    </MemoryRouter>
  )
}

describe('PayComparison', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText('Loading pay data...')).toBeInTheDocument()
  })

  it('shows fallback when no data', () => {
    useData.mockReturnValue({ data: null, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('No pay comparison data available for this council.')).toBeInTheDocument()
  })

  it('renders the page title with council name', () => {
    useData.mockReturnValue({ data: mockPayData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Executive Pay Comparison')).toBeInTheDocument()
    expect(screen.getByText(/Burnley Council compares/)).toBeInTheDocument()
  })

  it('renders CEO profile section', () => {
    useData.mockReturnValue({ data: mockPayData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Lukman Patel')).toBeInTheDocument()
    expect(screen.getByText('Test background text.')).toBeInTheDocument()
    expect(screen.getByText(/Appointed: November 2023/)).toBeInTheDocument()
  })

  it('renders stat cards with correct values', () => {
    useData.mockReturnValue({ data: mockPayData, loading: false, error: null })
    renderComponent()
    // Values appear in both stat cards and comparison table — check they exist at all
    expect(screen.getAllByText('£113,001').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('5.4:1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('6.3:1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('<250')).toBeInTheDocument()
  })

  it('renders senior officer cards', () => {
    useData.mockReturnValue({ data: mockPayData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Chief Operating Officer')).toBeInTheDocument()
    expect(screen.getByText('Head of Legal')).toBeInTheDocument()
    expect(screen.getByText('£90,000-£98,000')).toBeInTheDocument()
  })

  it('renders TPA Rich List section', () => {
    useData.mockReturnValue({ data: mockPayData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText(/TaxPayers' Alliance/)).toBeInTheDocument()
    expect(screen.getByText('2022/23')).toBeInTheDocument()
    expect(screen.getByText('2023/24')).toBeInTheDocument()
  })

  it('renders councillor allowances section', () => {
    useData.mockReturnValue({ data: mockPayData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Councillor Allowances')).toBeInTheDocument()
    expect(screen.getByText('£4,634')).toBeInTheDocument()
    expect(screen.getByText('£21,594')).toBeInTheDocument()
  })

  it('renders gender pay gap exempt note', () => {
    useData.mockReturnValue({ data: mockPayData, loading: false, error: null })
    renderComponent()
    // Heading contains an icon SVG + text — use getAllByText to handle any duplicates
    expect(screen.getAllByText(/Gender Pay Gap/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Fewer than 250 employees/)).toBeInTheDocument()
  })

  it('renders comparison table', () => {
    useData.mockReturnValue({ data: mockPayData, loading: false, error: null })
    renderComponent()
    const table = screen.getByRole('table', { name: /Executive pay comparison/ })
    expect(table).toBeInTheDocument()
  })

  it('renders data quality note', () => {
    useData.mockReturnValue({ data: mockPayData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('From Pay Policy Statements.')).toBeInTheDocument()
    expect(screen.getByText(/Last updated: 2026-02-09/)).toBeInTheDocument()
  })

  it('renders FOI CTA', () => {
    useData.mockReturnValue({ data: mockPayData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Want the exact figures?')).toBeInTheDocument()
    expect(screen.getByText(/Request Pay Data via FOI/)).toBeInTheDocument()
  })
})
