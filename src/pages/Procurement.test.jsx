import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Procurement from './Procurement'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
}

const mockProcurementData = {
  meta: {
    council_id: 'burnley',
    council_name: 'Burnley Borough Council',
    generated: '2026-02-10',
    source: 'Contracts Finder',
    total_notices: 3,
  },
  stats: {
    total_notices: 3,
    awarded_count: 2,
    total_awarded_value: 125000,
    sme_awarded_pct: 50,
    by_year: { '2025': 2, '2024': 1 },
    top_suppliers: [
      { name: 'ACME Services Ltd', contracts: 2, total_value: 100000 },
      { name: 'Widget Corp', contracts: 1, total_value: 50000 },
    ],
  },
  contracts: [
    {
      id: 'contract-1',
      title: 'Office Cleaning Services',
      description: 'Regular cleaning of council offices',
      status: 'awarded',
      notice_type: 'Contract',
      published_date: '2025-03-15',
      deadline_date: '2025-04-15',
      awarded_date: '2025-05-01',
      awarded_supplier: 'ACME Services Ltd',
      awarded_value: 75000,
      awarded_to_sme: true,
      value_low: 50000,
      value_high: 100000,
      cpv_codes: '90911000',
      cpv_description: 'Cleaning services',
      region: 'North West',
      url: 'https://www.contractsfinder.service.gov.uk/Notice/1',
    },
    {
      id: 'contract-2',
      title: 'IT Support Contract',
      description: 'Managed IT support services',
      status: 'open',
      notice_type: 'Contract',
      published_date: '2025-06-01',
      awarded_supplier: null,
      awarded_value: null,
      value_low: 30000,
      value_high: 50000,
      cpv_codes: '72000000',
      cpv_description: 'IT services',
      region: 'North West',
      url: 'https://www.contractsfinder.service.gov.uk/Notice/2',
    },
    {
      id: 'contract-3',
      title: 'Waste Collection Services',
      description: 'Household waste collection',
      status: 'awarded',
      notice_type: 'Contract',
      published_date: '2024-11-20',
      awarded_date: '2025-01-10',
      awarded_supplier: 'Widget Corp',
      awarded_value: 50000,
      awarded_to_sme: false,
      cpv_codes: '90511000',
      cpv_description: 'Cleaning services',
      region: 'North West',
      url: 'https://www.contractsfinder.service.gov.uk/Notice/3',
    },
  ],
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Procurement />
    </MemoryRouter>
  )
}

describe('Procurement', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state while data loads', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(document.querySelector('.loading-state')).toBeTruthy()
  })

  it('shows error state when data fails to load', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/failed to load procurement data/i)).toBeInTheDocument()
  })

  it('renders procurement page heading with data', () => {
    useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Public Contracts')).toBeInTheDocument()
  })

  it('renders subtitle with contract count', () => {
    useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText(/3 contracts published by Burnley/)).toBeInTheDocument()
  })

  it('renders stat cards', () => {
    useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Total Notices')).toBeInTheDocument()
    expect(screen.getByText('Awarded Value')).toBeInTheDocument()
    expect(screen.getByText('SME Awards')).toBeInTheDocument()
    expect(screen.getByText('Contracts Awarded')).toBeInTheDocument()
  })

  it('renders search input', () => {
    useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    renderComponent()
    const searchInput = screen.getByPlaceholderText(/search contracts/i)
    expect(searchInput).toBeInTheDocument()
  })

  it('renders contracts table with rows', () => {
    useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Office Cleaning Services')).toBeInTheDocument()
    expect(screen.getByText('IT Support Contract')).toBeInTheDocument()
    expect(screen.getByText('Waste Collection Services')).toBeInTheDocument()
  })

  it('renders sortable column headers', () => {
    useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    renderComponent()
    // SortHeader components use aria-label "Sort by {label}"
    expect(screen.getByLabelText('Sort by Contract')).toBeInTheDocument()
    expect(screen.getByLabelText('Sort by Published')).toBeInTheDocument()
    expect(screen.getByLabelText('Sort by Value')).toBeInTheDocument()
  })

  it('renders status badges on contracts', () => {
    useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    renderComponent()
    // Status badges render in the table rows
    const badges = document.querySelectorAll('.procurement-status-badge')
    expect(badges.length).toBe(3)
  })

  it('filters contracts by search text', () => {
    useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    renderComponent()
    const searchInput = screen.getByPlaceholderText(/search contracts/i)
    fireEvent.change(searchInput, { target: { value: 'cleaning' } })
    expect(screen.getByText('Office Cleaning Services')).toBeInTheDocument()
    expect(screen.queryByText('IT Support Contract')).not.toBeInTheDocument()
  })

  it('shows empty state when no contracts exist', () => {
    const emptyData = {
      ...mockProcurementData,
      contracts: [],
    }
    useData.mockReturnValue({ data: emptyData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText(/no procurement data available/i)).toBeInTheDocument()
  })

  it('renders top suppliers section', () => {
    useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Top Suppliers')).toBeInTheDocument()
    // Supplier names appear in both top suppliers cards and table rows
    const acmeElements = screen.getAllByText('ACME Services Ltd')
    expect(acmeElements.length).toBeGreaterThanOrEqual(1)
    const widgetElements = screen.getAllByText('Widget Corp')
    expect(widgetElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renders status filter dropdown', () => {
    useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    renderComponent()
    expect(screen.getByLabelText('Status')).toBeInTheDocument()
    expect(screen.getByText('All Statuses')).toBeInTheDocument()
  })

  it('renders advanced filters toggle button', () => {
    useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    renderComponent()
    const advancedBtn = screen.getByText(/Advanced/)
    expect(advancedBtn).toBeInTheDocument()
  })

  it('renders contract count in filter results', () => {
    useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    renderComponent()
    // "3 contracts" appears in subtitle and filter results bar
    const matches = screen.getAllByText(/3 contracts/)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })
})
