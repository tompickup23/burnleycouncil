import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
      service_division: 'Finance',
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
  ],
  filteredCount: 2,
  totalPages: 1,
  stats: {
    total: 7500,
    count: 2,
    suppliers: 2,
    avgTransaction: 3750,
    medianAmount: 3750,
    maxTransaction: 5000,
    byType: { revenue: 7500 },
  },
  chartData: {
    yearData: [],
    categoryData: [],
    serviceData: [],
    supplierData: [],
    typeData: [],
    monthlyData: [],
  },
}

const mockFilterOptions = {
  financial_years: ['2024/25'],
  quarters: ['Q1', 'Q2', 'Q3', 'Q4'],
  types: ['revenue'],
  service_divisions: ['Finance', 'IT'],
  expenditure_categories: ['Consulting', 'Software'],
  capital_revenue: ['revenue'],
  suppliers: ['ACME Corp', 'Widget Ltd'],
  months: [],
}

function workerMock(overrides = {}) {
  return {
    loading: false,
    ready: true,
    error: null,
    filterOptions: mockFilterOptions,
    results: mockResults,
    totalRecords: 2,
    query: vi.fn(),
    exportCSV: vi.fn(),
    ...overrides,
  }
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Spending />
    </MemoryRouter>
  )
}

describe('Spending', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

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

  it('renders spending page heading with data', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    expect(screen.getByText('Spending Explorer')).toBeInTheDocument()
    expect(screen.getByText(/2 council transactions/)).toBeInTheDocument()
  })

  it('shows search and filter controls', () => {
    useSpendingWorker.mockReturnValue(workerMock())
    renderComponent()
    expect(screen.getByLabelText(/search spending records/i)).toBeInTheDocument()
    expect(screen.getByText('Filters')).toBeInTheDocument()
  })

  it('renders with empty results without crashing', () => {
    useSpendingWorker.mockReturnValue(workerMock({
      results: {
        paginatedData: [],
        filteredCount: 0,
        totalPages: 0,
        stats: { total: 0, count: 0, suppliers: 0, avgTransaction: 0, medianAmount: 0, maxTransaction: 0, byType: {} },
        chartData: { yearData: [], categoryData: [], serviceData: [], supplierData: [], typeData: [], monthlyData: [] },
      },
      totalRecords: 0,
    }))
    renderComponent()
    expect(screen.getByText('Spending Explorer')).toBeInTheDocument()
    expect(screen.getByText(/0 council transactions/)).toBeInTheDocument()
  })
})
