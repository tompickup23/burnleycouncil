import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Spending from './Spending'

// Mock window.matchMedia for useIsMobile hook
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

vi.mock('../hooks/useSpendingWorker', () => ({
  useSpendingWorker: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock('recharts', () => {
  const React = require('react')
  return {
    ResponsiveContainer: ({ children }) => React.createElement('div', { 'data-testid': 'responsive-container' }, children),
    BarChart: ({ children }) => React.createElement('div', { 'data-testid': 'bar-chart' }, children),
    PieChart: ({ children }) => React.createElement('div', { 'data-testid': 'pie-chart' }, children),
    AreaChart: ({ children }) => React.createElement('div', { 'data-testid': 'area-chart' }, children),
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Pie: () => null,
    Cell: () => null,
    Area: () => null,
  }
})

import { useSpendingWorker } from '../hooks/useSpendingWorker'
import { useCouncilConfig } from '../context/CouncilConfig'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
  spending_data_period: 'April 2021 – present',
}

const mockResults = {
  paginatedData: [
    {
      date: '2025-01-15',
      supplier: 'ACME Corp',
      amount: 5000,
      type: 'revenue',
      service_division: 'Finance - Accounts',
      expenditure_category: 'Consulting',
      transaction_number: 'TX001',
    },
    {
      date: '2025-02-01',
      supplier: 'Widget Ltd',
      amount: 2500,
      type: 'revenue',
      service_division: 'IT',
      expenditure_category: 'Software',
      transaction_number: 'TX002',
    },
    {
      date: '2025-02-10',
      supplier: 'BuildCo',
      amount: 150000,
      type: 'capital',
      service_division: 'Housing',
      expenditure_category: 'Construction',
      transaction_number: 'TX003',
      is_covid_related: true,
    },
  ],
  filteredCount: 3,
  totalPages: 1,
  stats: {
    total: 157500,
    count: 3,
    suppliers: 3,
    avgTransaction: 52500,
    medianAmount: 5000,
    maxTransaction: 150000,
    byType: { revenue: 7500, capital: 150000 },
  },
  chartData: {
    yearData: [
      { year: '2023/24', amount: 5000000, count: 1200 },
      { year: '2024/25', amount: 7500000, count: 1500 },
    ],
    categoryData: [
      { name: 'Construction', value: 150000 },
      { name: 'Consulting', value: 5000 },
      { name: 'Software', value: 2500 },
    ],
    serviceData: [
      { name: 'Housing', fullName: 'Housing Services', value: 150000 },
      { name: 'Finance', fullName: 'Finance - Accounts', value: 5000 },
      { name: 'IT', fullName: 'IT Services', value: 2500 },
    ],
    supplierData: [
      { name: 'BuildCo', fullName: 'BuildCo Ltd', value: 150000, count: 1 },
      { name: 'ACME Corp', fullName: 'ACME Corp', value: 5000, count: 1 },
    ],
    typeData: [
      { name: 'Capital', rawType: 'capital', value: 150000 },
      { name: 'Revenue', rawType: 'revenue', value: 7500 },
    ],
    monthlyData: [
      { label: 'Jan 25', amount: 5000, avg: 5000 },
      { label: 'Feb 25', amount: 152500, avg: 78750 },
    ],
  },
}

const mockFilterOptions = {
  financial_years: ['2024/25', '2023/24'],
  quarters: ['Q1', 'Q2', 'Q3', 'Q4'],
  types: ['revenue', 'capital'],
  service_divisions: ['Finance', 'IT', 'Housing'],
  expenditure_categories: ['Consulting', 'Software', 'Construction'],
  capital_revenue: ['revenue', 'capital'],
  suppliers: ['ACME Corp', 'Widget Ltd', 'BuildCo'],
  months: ['January 2025', 'February 2025'],
}

function workerMock(overrides = {}) {
  return {
    loading: false,
    ready: true,
    error: null,
    filterOptions: mockFilterOptions,
    results: mockResults,
    totalRecords: 3,
    query: vi.fn(),
    exportCSV: vi.fn(),
    // v3 chunked fields
    yearManifest: null,
    loadedYears: [],
    yearLoading: null,
    allYearsLoaded: false,
    latestYear: null,
    chunked: false,
    loadYear: vi.fn(),
    loadAllYears: vi.fn(),
    // v4 monthly fields
    monthly: false,
    loadedMonths: [],
    monthLoading: null,
    latestMonth: null,
    loadMonth: vi.fn(),
    ...overrides,
  }
}

const emptyResults = {
  paginatedData: [],
  filteredCount: 0,
  totalPages: 0,
  stats: { total: 0, count: 0, suppliers: 0, avgTransaction: 0, medianAmount: 0, maxTransaction: 0, byType: {} },
  chartData: { yearData: [], categoryData: [], serviceData: [], supplierData: [], typeData: [], monthlyData: [] },
}

function renderComponent(initialEntries = ['/spending']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Spending />
    </MemoryRouter>
  )
}

describe('Spending', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
    Element.prototype.scrollIntoView = vi.fn()
  })

  // === Loading / Error / Basic ===
  it('shows loading state while data loads', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      loading: true,
      ready: false,
      results: null,
      filterOptions: null,
      totalRecords: 0,
    }))
    renderComponent()
    expect(screen.getByText(/loading spending data/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      loading: false,
      ready: false,
      error: new Error('fail'),
      results: null,
      filterOptions: null,
    }))
    renderComponent()
    expect(screen.getByText(/unable to load spending data/i)).toBeInTheDocument()
  })

  it('shows error message string when error is a string', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      loading: false,
      ready: false,
      error: 'Network timeout',
      results: null,
      filterOptions: null,
    }))
    renderComponent()
    expect(screen.getByText('Network timeout')).toBeInTheDocument()
  })

  it('renders spending page heading with data', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    expect(screen.getByText('Spending Explorer')).toBeInTheDocument()
    expect(screen.getByText(/3 council transactions/)).toBeInTheDocument()
  })

  it('renders with empty results without crashing', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      results: emptyResults,
      totalRecords: 0,
    }))
    renderComponent()
    expect(screen.getByText('Spending Explorer')).toBeInTheDocument()
    expect(screen.getByText(/0 council transactions/)).toBeInTheDocument()
  })

  // === Search ===
  it('renders search input', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    expect(screen.getByLabelText(/search spending records/i)).toBeInTheDocument()
  })

  it('shows filter toggle button', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    expect(screen.getByText('Filters')).toBeInTheDocument()
  })

  // === Export CSV ===
  it('renders export CSV button', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    expect(screen.getByText('Export CSV')).toBeInTheDocument()
  })

  it('calls exportCSV when export button clicked', () => {
    const mock = workerMock()
    useSpendingWorker.mockReturnValue(mock)
    renderComponent()
    const exportBtn = screen.getByText('Export CSV')
    fireEvent.click(exportBtn)
    expect(mock.exportCSV).toHaveBeenCalledTimes(1)
    expect(mock.exportCSV).toHaveBeenCalledWith(expect.objectContaining({
      filename: expect.stringContaining('burnley-spending-export'),
    }))
  })

  // === Summary Stats ===
  it('renders summary stat cards', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    expect(screen.getByText('Total Spend')).toBeInTheDocument()
    expect(screen.getByText('Transactions')).toBeInTheDocument()
    expect(screen.getByText('Unique Suppliers')).toBeInTheDocument()
    expect(screen.getByText('Avg per Transaction')).toBeInTheDocument()
  })

  it('renders transaction count in stat card', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    // stat card value for 3 transactions — appears multiple times (transactions + suppliers)
    const statCards = document.querySelectorAll('.stat-card-value')
    const values = [...statCards].map(el => el.textContent)
    expect(values).toContain('3')
  })

  it('renders type breakdown when byType data exists', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    // Type breakdown shows segments for revenue and capital
    const typeBreakdownCard = document.querySelector('.type-breakdown-card')
    expect(typeBreakdownCard).toBeTruthy()
    const segments = document.querySelectorAll('.type-segment')
    expect(segments.length).toBe(2)
  })

  it('does not render type breakdown when byType is empty', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      results: {
        ...mockResults,
        stats: { ...mockResults.stats, byType: {} },
      },
    }))
    renderComponent()
    const typeBreakdownCard = document.querySelector('.type-breakdown-card')
    expect(typeBreakdownCard).toBeFalsy()
  })

  // === Analytics Stats Row ===
  it('renders analytics stats when count > 10 and stdDev > 0', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      results: {
        ...mockResults,
        stats: {
          ...mockResults.stats,
          count: 50,
          stdDev: 25000,
          p90: 120000,
          supplierGini: 0.75,
          p75: 80000,
          p25: 2000,
        },
      },
    }))
    renderComponent()
    expect(screen.getByText('Std Dev')).toBeInTheDocument()
    expect(screen.getByText('P90')).toBeInTheDocument()
    expect(screen.getByText('Supplier Gini')).toBeInTheDocument()
    expect(screen.getByText('IQR')).toBeInTheDocument()
    expect(screen.getByText('0.75')).toBeInTheDocument()
    expect(screen.getByText('Concentrated')).toBeInTheDocument()
  })

  it('shows "Moderate" for Gini between 0.5 and 0.7', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      results: {
        ...mockResults,
        stats: {
          ...mockResults.stats,
          count: 50,
          stdDev: 25000,
          avgTransaction: 50000,
          p90: 120000,
          supplierGini: 0.6,
          p75: 80000,
          p25: 2000,
        },
      },
    }))
    renderComponent()
    expect(screen.getByText('0.60')).toBeInTheDocument()
    expect(screen.getByText('Moderate')).toBeInTheDocument()
  })

  it('shows "Diverse" for Gini below 0.5', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      results: {
        ...mockResults,
        stats: {
          ...mockResults.stats,
          count: 50,
          stdDev: 25000,
          avgTransaction: 50000,
          p90: 120000,
          supplierGini: 0.3,
          p75: 80000,
          p25: 2000,
        },
      },
    }))
    renderComponent()
    expect(screen.getByText('Diverse')).toBeInTheDocument()
  })

  it('does not render analytics stats when count <= 10', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    expect(screen.queryByText('Std Dev')).not.toBeInTheDocument()
    expect(screen.queryByText('Supplier Gini')).not.toBeInTheDocument()
  })

  // === Tab Navigation ===
  it('renders Data Table and Visualisations tabs', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Data Table' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Visualisations' })).toBeInTheDocument()
  })

  it('shows Data Table tab as active by default', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    const tableTab = screen.getByRole('tab', { name: 'Data Table' })
    expect(tableTab).toHaveAttribute('aria-selected', 'true')
  })

  it('switches to Visualisations tab on click', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    const chartsTab = screen.getByRole('tab', { name: 'Visualisations' })
    fireEvent.click(chartsTab)
    expect(chartsTab).toHaveAttribute('aria-selected', 'true')
    const tableTab = screen.getByRole('tab', { name: 'Data Table' })
    expect(tableTab).toHaveAttribute('aria-selected', 'false')
  })

  // === Data Table ===
  it('renders spending table with column headers', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    const table = screen.getByRole('table', { name: /spending records/i })
    expect(table).toBeInTheDocument()
    // Column headers — use scope=col th elements to avoid filter label ambiguity
    const headers = table.querySelectorAll('th[scope="col"]')
    const headerTexts = [...headers].map(h => h.textContent.trim())
    expect(headerTexts).toContain('Supplier')
    expect(headerTexts).toContain('Service')
    expect(headerTexts).toContain('Category')
    expect(headerTexts).toContain('Type')
  })

  it('renders supplier names in table rows', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    expect(screen.getByText('ACME Corp')).toBeInTheDocument()
    expect(screen.getByText('Widget Ltd')).toBeInTheDocument()
    expect(screen.getByText('BuildCo')).toBeInTheDocument()
  })

  it('renders supplier names as links', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    const supplierLinks = document.querySelectorAll('.supplier-link')
    expect(supplierLinks.length).toBe(3)
  })

  it('renders type badges on table rows', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    const typeBadges = document.querySelectorAll('.type-badge')
    expect(typeBadges.length).toBe(3)
  })

  it('renders COVID badge on covid-related transactions', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    expect(screen.getByText('COVID')).toBeInTheDocument()
  })

  it('renders flag buttons for each transaction', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    const flagBtns = document.querySelectorAll('.flag-btn')
    expect(flagBtns.length).toBe(3)
  })

  it('renders sortable column headers', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    const dateHeader = screen.getByLabelText('Sort by date')
    expect(dateHeader).toBeTruthy()
    const supplierHeader = screen.getByLabelText('Sort by supplier')
    expect(supplierHeader).toBeTruthy()
    const amountHeader = screen.getByLabelText('Sort by amount')
    expect(amountHeader).toBeTruthy()
  })

  it('renders service division text (truncated after dash)', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    // 'Finance - Accounts' should show 'Accounts' (after the dash)
    expect(screen.getByText('Accounts')).toBeInTheDocument()
  })

  // === Pagination ===
  it('does not render pagination when totalPages is 1', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument()
  })

  it('renders pagination when totalPages > 1', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      results: {
        ...mockResults,
        filteredCount: 500,
        totalPages: 3,
      },
    }))
    renderComponent()
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByLabelText('First page')).toBeInTheDocument()
    expect(screen.getByLabelText('Previous page')).toBeInTheDocument()
    expect(screen.getByLabelText('Next page')).toBeInTheDocument()
    expect(screen.getByLabelText('Last page')).toBeInTheDocument()
  })

  it('disables First and Previous buttons on page 1', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      results: {
        ...mockResults,
        filteredCount: 500,
        totalPages: 3,
      },
    }))
    renderComponent()
    expect(screen.getByLabelText('First page')).toBeDisabled()
    expect(screen.getByLabelText('Previous page')).toBeDisabled()
    expect(screen.getByLabelText('Next page')).not.toBeDisabled()
    expect(screen.getByLabelText('Last page')).not.toBeDisabled()
  })

  it('renders page size selector with pagination', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      results: {
        ...mockResults,
        filteredCount: 500,
        totalPages: 3,
      },
    }))
    renderComponent()
    expect(screen.getByLabelText('Rows:')).toBeInTheDocument()
    const select = document.querySelector('#page-size')
    expect(select).toBeTruthy()
  })

  it('renders range text in pagination', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      results: {
        ...mockResults,
        paginatedData: mockResults.paginatedData,
        filteredCount: 500,
        totalPages: 3,
      },
    }))
    renderComponent()
    // Default page size 200, page 1 → "1–200 of 500"
    const rangeEl = document.querySelector('.page-range')
    expect(rangeEl).toBeTruthy()
  })

  // === Charts View ===
  it('renders chart cards when Visualisations tab is active', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    const chartsTab = screen.getByRole('tab', { name: 'Visualisations' })
    fireEvent.click(chartsTab)
    expect(screen.getByText('Monthly Spending Trend')).toBeInTheDocument()
    expect(screen.getByText('Spend by Financial Year')).toBeInTheDocument()
    expect(screen.getByText('Spending by Type')).toBeInTheDocument()
    expect(screen.getByText('Top 10 Suppliers by Value')).toBeInTheDocument()
    expect(screen.getByText('Top Expenditure Categories')).toBeInTheDocument()
    expect(screen.getByText('Spending by Service Division')).toBeInTheDocument()
  })

  it('hides data table when Visualisations tab is active', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    const chartsTab = screen.getByRole('tab', { name: 'Visualisations' })
    fireEvent.click(chartsTab)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders monthly trend subtitle with month count', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Visualisations' }))
    expect(screen.getByText(/2 months with 3-month rolling average/)).toBeInTheDocument()
  })

  it('renders month-over-month change indicator', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Visualisations' }))
    // Feb (152500) vs Jan (5000) → huge % increase
    const trendEl = document.querySelector('.chart-trend')
    expect(trendEl).toBeTruthy()
    expect(trendEl.classList.contains('up')).toBe(true)
  })

  it('renders top categories in inline bar list', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Visualisations' }))
    expect(screen.getByText('Construction')).toBeInTheDocument()
    expect(screen.getByText('Consulting')).toBeInTheDocument()
    expect(screen.getByText('Software')).toBeInTheDocument()
  })

  it('renders service divisions in inline bar list', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Visualisations' }))
    expect(screen.getByText('Housing')).toBeInTheDocument()
  })

  it('renders year footer with recent year stats', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Visualisations' }))
    expect(screen.getByText('2023/24')).toBeInTheDocument()
    expect(screen.getByText('2024/25')).toBeInTheDocument()
  })

  it('renders type donut legend', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Visualisations' }))
    const donutLegend = document.querySelector('.donut-legend')
    expect(donutLegend).toBeTruthy()
    const items = document.querySelectorAll('.donut-legend-item')
    expect(items.length).toBe(2) // capital + revenue
  })

  // === Limited Data Banner ===
  it('shows limited data banner when records < 5000', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      totalRecords: 2000,
    }))
    renderComponent()
    const banner = document.querySelector('.limited-data-banner')
    expect(banner).toBeTruthy()
    expect(banner.textContent).toContain('limited spending data')
    expect(banner.textContent).toContain('2,000 records')
  })

  it('shows data period in limited data banner when configured', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      totalRecords: 2000,
    }))
    renderComponent()
    const banner = document.querySelector('.limited-data-banner')
    expect(banner.textContent).toContain('April 2021 – present')
  })

  it('does not show limited data banner when records >= 5000', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      totalRecords: 30000,
    }))
    renderComponent()
    const banner = document.querySelector('.limited-data-banner')
    expect(banner).toBeFalsy()
  })

  it('does not show limited data banner when totalRecords is 0', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      totalRecords: 0,
      results: emptyResults,
    }))
    renderComponent()
    const banner = document.querySelector('.limited-data-banner')
    expect(banner).toBeFalsy()
  })

  // === DOGE Evidence Banner ===
  it('shows DOGE evidence banner when ref=doge in URL', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent(['/spending?ref=doge'])
    const banner = document.querySelector('.doge-evidence-banner')
    expect(banner).toBeTruthy()
    expect(banner.textContent).toContain('DOGE Investigation')
  })

  it('shows filtered supplier name in DOGE banner', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent(['/spending?ref=doge&supplier=ACME+Corp'])
    const banner = document.querySelector('.doge-evidence-banner')
    expect(banner).toBeTruthy()
    expect(banner.textContent).toContain('ACME Corp')
  })

  it('does not show DOGE banner when ref is not set', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    const banner = document.querySelector('.doge-evidence-banner')
    expect(banner).toBeFalsy()
  })

  // === v3/v4 Chunked Loading Banners ===
  it('shows year loading banner when yearLoading is set', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      chunked: true,
      yearLoading: '2024/25',
    }))
    renderComponent()
    const banner = document.querySelector('.year-loading-banner')
    expect(banner).toBeTruthy()
    expect(banner.textContent).toContain('2024/25')
  })

  it('shows month loading banner when monthLoading is set', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      chunked: true,
      monthly: true,
      monthLoading: 'January 2025',
    }))
    renderComponent()
    const banner = document.querySelector('.year-loading-banner')
    expect(banner).toBeTruthy()
    expect(banner.textContent).toContain('January 2025')
  })

  it('shows partial years info banner when loading all years', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      chunked: true,
      loadedYears: ['2024/25'],
      allYearsLoaded: false,
      yearManifest: { '2024/25': {}, '2023/24': {}, '2022/23': {} },
    }))
    renderComponent()
    const infoBanner = document.querySelector('.year-loading-info')
    expect(infoBanner).toBeTruthy()
    expect(infoBanner.textContent).toContain('1 of 3 years')
  })

  // === Filter Panel ===
  it('renders filter panel by default (showFilters starts true)', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    const filterPanel = document.querySelector('.filter-panel')
    expect(filterPanel).toBeTruthy()
  })

  it('hides filter panel when toggle clicked', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    const toggle = screen.getByText('Filters').closest('button')
    fireEvent.click(toggle)
    const filterPanel = document.querySelector('.filter-panel')
    expect(filterPanel).toBeFalsy()
  })

  it('renders amount range inputs', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    expect(screen.getByLabelText('Minimum amount')).toBeInTheDocument()
    expect(screen.getByLabelText('Maximum amount')).toBeInTheDocument()
  })

  // === Query called on mount ===
  it('calls query function on initial render', () => {
    const mock = workerMock()
    useSpendingWorker.mockReturnValue(mock)
    renderComponent()
    expect(mock.query).toHaveBeenCalled()
  })

  // === v3 chunked auto-load ===
  it('calls loadYear when financial_year filter selects unloaded year', () => {
    const mock = workerMock({
      chunked: true,
      yearManifest: { '2024/25': { file: 'spending-2024-25.json' }, '2023/24': { file: 'spending-2023-24.json' } },
      loadedYears: ['2024/25'],
    })
    useSpendingWorker.mockReturnValue(mock)
    renderComponent(['/spending?financial_year=2023/24'])
    expect(mock.loadYear).toHaveBeenCalledWith('2023/24')
  })

  it('calls loadAllYears when no financial_year filter and not all years loaded', () => {
    const mock = workerMock({
      chunked: true,
      yearManifest: { '2024/25': {}, '2023/24': {} },
      loadedYears: ['2024/25'],
      allYearsLoaded: false,
    })
    useSpendingWorker.mockReturnValue(mock)
    renderComponent(['/spending'])
    expect(mock.loadAllYears).toHaveBeenCalled()
  })

  // === aria-busy ===
  it('sets aria-busy on main container when loading with results', () => {
    useSpendingWorker.mockReturnValue(workerMock({ loading: true }))
    renderComponent()
    const page = document.querySelector('.spending-page')
    expect(page).toBeTruthy()
    expect(page.getAttribute('aria-busy')).toBe('true')
  })

  it('sets aria-busy false when not loading', () => {
    useSpendingWorker.mockReturnValue(workerMock({ loading: false }))
    renderComponent()
    const page = document.querySelector('.spending-page')
    expect(page.getAttribute('aria-busy')).toBe('false')
  })

  // === Table loading overlay ===
  it('shows table loading overlay when loading with existing results', () => {
    useSpendingWorker.mockReturnValue(workerMock({ loading: true }))
    renderComponent()
    const overlay = document.querySelector('.table-loading-overlay')
    expect(overlay).toBeTruthy()
  })

  it('does not show table loading overlay when not loading', () => {
    useSpendingWorker.mockReturnValue(workerMock({ loading: false }))
    renderComponent()
    const overlay = document.querySelector('.table-loading-overlay')
    expect(overlay).toBeFalsy()
  })
})
