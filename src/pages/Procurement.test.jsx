import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Procurement from './Procurement'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

// Mock recharts to avoid canvas issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
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

// Calculate dates relative to now for expiring contracts
const now = new Date()
const in15Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 15).toISOString().split('T')[0]
const in60Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60).toISOString().split('T')[0]
const in120Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 120).toISOString().split('T')[0]
const in300Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 300).toISOString().split('T')[0]
const pastDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString().split('T')[0]

const mockProcurementData = {
  meta: {
    council_id: 'burnley',
    council_name: 'Burnley Borough Council',
    generated: '2026-02-10',
    source: 'Contracts Finder',
    total_notices: 8,
  },
  stats: {
    total_notices: 8,
    awarded_count: 6,
    total_awarded_value: 725000,
    sme_awarded_pct: 50,
    by_year: { '2025': 5, '2024': 3 },
    top_suppliers: [
      { name: 'ACME Services Ltd', contracts: 4, total_value: 400000 },
      { name: 'Widget Corp', contracts: 2, total_value: 200000 },
      { name: 'NOT AWARDED TO SUPPLIER', contracts: 1, total_value: 0 },
    ],
  },
  contracts: [
    {
      id: 'contract-1',
      title: 'Office Cleaning Services',
      description: 'Regular cleaning of council offices',
      status: 'awarded',
      notice_type: 'Contract',
      procedure_type: 'Open',
      published_date: '2025-03-15',
      deadline_date: '2025-04-15',
      awarded_date: '2025-05-01',
      awarded_supplier: 'ACME Services Ltd',
      awarded_value: 75000,
      awarded_to_sme: true,
      value_low: 50000,
      value_high: 100000,
      bid_count: 4,
      contract_start: '2025-06-01',
      contract_end: in15Days,
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
      bid_count: 1,
      contract_end: in60Days,
      cpv_codes: '90511000',
      cpv_description: 'Waste management',
      region: 'North West',
      url: 'https://www.contractsfinder.service.gov.uk/Notice/3',
    },
    {
      id: 'contract-4',
      title: 'Road Resurfacing Programme',
      description: 'Highway resurfacing works for 2025-26',
      status: 'awarded',
      notice_type: 'Contract',
      procedure_type: 'Restricted',
      published_date: '2025-01-10',
      awarded_date: '2025-03-20',
      awarded_supplier: 'ACME Services Ltd',
      awarded_value: 200000,
      awarded_to_sme: false,
      bid_count: 3,
      contract_end: in120Days,
      cpv_codes: '45233220',
      cpv_description: 'Road works',
      region: 'North West',
      url: 'https://www.contractsfinder.service.gov.uk/Notice/4',
    },
    {
      id: 'contract-5',
      title: 'Leisure Centre Management',
      description: 'Management of council leisure centres',
      status: 'awarded',
      notice_type: 'Contract',
      published_date: '2025-02-15',
      awarded_date: '2025-04-01',
      awarded_supplier: 'ACME Services Ltd',
      awarded_value: 150000,
      awarded_to_sme: true,
      bid_count: 2,
      contract_end: in300Days,
      cpv_codes: '92610000',
      cpv_description: 'Leisure services',
      region: 'North West',
      url: 'https://www.contractsfinder.service.gov.uk/Notice/5',
    },
    {
      id: 'contract-6',
      title: 'Parks &amp; Gardens Maintenance',
      description: 'Grounds maintenance for public parks',
      status: 'awarded',
      notice_type: 'Contract',
      published_date: '2024-09-01',
      awarded_date: '2024-11-15',
      awarded_supplier: 'Smith &amp; Sons Ltd',
      awarded_value: 80000,
      awarded_to_sme: false,
      bid_count: 1,
      contract_end: pastDate,
      cpv_codes: '77300000',
      cpv_description: 'Horticultural services',
      region: 'North West',
      url: 'https://www.contractsfinder.service.gov.uk/Notice/6',
    },
    {
      id: 'contract-7',
      title: 'Security Services',
      description: 'Building security for council premises',
      status: 'awarded',
      notice_type: 'Contract',
      published_date: '2024-06-01',
      awarded_date: '2024-08-01',
      awarded_supplier: 'ACME Services Ltd',
      awarded_value: 120000,
      awarded_to_sme: false,
      bid_count: 5,
      contract_end: in60Days,
      cpv_codes: '79710000',
      cpv_description: 'Security services',
      region: 'North West',
      url: 'https://www.contractsfinder.service.gov.uk/Notice/7',
    },
    {
      id: 'contract-8',
      title: 'Catering Services Withdrawn',
      description: 'School catering contract',
      status: 'withdrawn',
      notice_type: 'Contract',
      published_date: '2025-05-01',
      awarded_supplier: null,
      awarded_value: null,
      value_low: 60000,
      cpv_codes: '55500000',
      cpv_description: 'Catering services',
      region: 'North West',
      url: null,
    },
  ],
}

// Helper to get the main contracts table (not the expiring contracts table)
function getMainTable() {
  const tables = document.querySelectorAll('.procurement-table')
  // The main table has sortable headers; find the one within .procurement-table-container
  // that's NOT inside .procurement-expiring-section
  for (const table of tables) {
    if (!table.closest('.procurement-expiring-section')) {
      return table
    }
  }
  return tables[tables.length - 1] // fallback
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

  // ─── Loading & Error States ─────────────────────────────

  describe('Loading & Error States', () => {
    it('shows loading state while data loads', () => {
      useData.mockReturnValue({ data: null, loading: true, error: null })
      renderComponent()
      expect(document.querySelector('.loading-state')).toBeTruthy()
    })

    it('shows error state when data fails to load', () => {
      useData.mockReturnValue({ data: null, loading: false, error: new Error('Network timeout') })
      renderComponent()
      expect(screen.getByText(/failed to load procurement data/i)).toBeInTheDocument()
      expect(screen.getByText(/Network timeout/)).toBeInTheDocument()
    })

    it('shows empty state when no contracts exist', () => {
      const emptyData = { ...mockProcurementData, contracts: [] }
      useData.mockReturnValue({ data: emptyData, loading: false, error: null })
      renderComponent()
      expect(screen.getByText(/no procurement data available/i)).toBeInTheDocument()
    })

    it('empty state includes council name', () => {
      const emptyData = { ...mockProcurementData, contracts: [] }
      useData.mockReturnValue({ data: emptyData, loading: false, error: null })
      renderComponent()
      expect(screen.getByText(/Burnley/i)).toBeInTheDocument()
    })
  })

  // ─── Page Header ────────────────────────────────────────

  describe('Page Header', () => {
    it('renders procurement page heading', () => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
      renderComponent()
      expect(screen.getByText('Public Contracts')).toBeInTheDocument()
    })

    it('renders subtitle with contract count and council name', () => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
      renderComponent()
      expect(screen.getByText(/8 contracts published by Burnley/)).toBeInTheDocument()
    })

    it('subtitle includes awarded count and total value', () => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
      renderComponent()
      expect(screen.getByText(/6 awarded/)).toBeInTheDocument()
    })
  })

  // ─── Stat Cards ─────────────────────────────────────────

  describe('Stat Cards', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    })

    it('renders all 4 main stat cards', () => {
      renderComponent()
      expect(screen.getByText('Total Notices')).toBeInTheDocument()
      expect(screen.getByText('Awarded Value')).toBeInTheDocument()
      expect(screen.getByText('SME Awards')).toBeInTheDocument()
      expect(screen.getByText('Contracts Awarded')).toBeInTheDocument()
    })

    it('displays correct total notices count', () => {
      renderComponent()
      const statCard = screen.getByText('Total Notices').closest('.procurement-stat-card')
      expect(within(statCard).getByText('8')).toBeInTheDocument()
    })

    it('displays correct awarded count', () => {
      renderComponent()
      const statCard = screen.getByText('Contracts Awarded').closest('.procurement-stat-card')
      expect(within(statCard).getByText('6')).toBeInTheDocument()
    })

    it('displays SME award percentage', () => {
      renderComponent()
      const statCard = screen.getByText('SME Awards').closest('.procurement-stat-card')
      expect(within(statCard).getByText('50.0%')).toBeInTheDocument()
    })
  })

  // ─── Search ─────────────────────────────────────────────

  describe('Search', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    })

    it('renders search input with placeholder', () => {
      renderComponent()
      expect(screen.getByPlaceholderText(/search contracts/i)).toBeInTheDocument()
    })

    it('filters contracts by title', () => {
      renderComponent()
      fireEvent.change(screen.getByPlaceholderText(/search contracts/i), { target: { value: 'cleaning' } })
      const mainTable = getMainTable()
      expect(within(mainTable).getAllByText('Office Cleaning Services').length).toBeGreaterThanOrEqual(1)
      expect(within(mainTable).queryByText('IT Support Contract')).not.toBeInTheDocument()
    })

    it('filters contracts by supplier name', () => {
      renderComponent()
      fireEvent.change(screen.getByPlaceholderText(/search contracts/i), { target: { value: 'Widget' } })
      const mainTable = getMainTable()
      expect(within(mainTable).getAllByText('Waste Collection Services').length).toBeGreaterThanOrEqual(1)
      expect(within(mainTable).queryByText('Office Cleaning Services')).not.toBeInTheDocument()
    })

    it('filters contracts by description', () => {
      renderComponent()
      fireEvent.change(screen.getByPlaceholderText(/search contracts/i), { target: { value: 'highway' } })
      const mainTable = getMainTable()
      expect(within(mainTable).getAllByText('Road Resurfacing Programme').length).toBeGreaterThanOrEqual(1)
    })

    it('filters contracts by CPV description', () => {
      renderComponent()
      fireEvent.change(screen.getByPlaceholderText(/search contracts/i), { target: { value: 'Horticultural' } })
      const allParks = screen.getAllByText(/Parks/)
      expect(allParks.length).toBeGreaterThanOrEqual(1)
    })

    it('search is case-insensitive', () => {
      renderComponent()
      fireEvent.change(screen.getByPlaceholderText(/search contracts/i), { target: { value: 'CLEANING' } })
      const mainTable = getMainTable()
      expect(within(mainTable).getAllByText('Office Cleaning Services').length).toBeGreaterThanOrEqual(1)
    })

    it('shows clear button when search has text', () => {
      renderComponent()
      fireEvent.change(screen.getByPlaceholderText(/search contracts/i), { target: { value: 'test' } })
      expect(screen.getByLabelText('Clear search')).toBeInTheDocument()
    })

    it('clearing search shows all contracts again', () => {
      renderComponent()
      fireEvent.change(screen.getByPlaceholderText(/search contracts/i), { target: { value: 'cleaning' } })
      const mainTable = getMainTable()
      expect(within(mainTable).queryByText('IT Support Contract')).not.toBeInTheDocument()
      fireEvent.click(screen.getByLabelText('Clear search'))
      expect(within(mainTable).getAllByText('IT Support Contract').length).toBeGreaterThanOrEqual(1)
    })

    it('shows "No contracts match" when search has no results', () => {
      renderComponent()
      fireEvent.change(screen.getByPlaceholderText(/search contracts/i), { target: { value: 'zzzznonexistent' } })
      expect(screen.getByText('No contracts match your search.')).toBeInTheDocument()
    })
  })

  // ─── Contracts Table ────────────────────────────────────

  describe('Contracts Table', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    })

    it('renders all contracts in main table', () => {
      renderComponent()
      const mainTable = getMainTable()
      expect(within(mainTable).getAllByText('Office Cleaning Services').length).toBeGreaterThanOrEqual(1)
      expect(within(mainTable).getAllByText('IT Support Contract').length).toBeGreaterThanOrEqual(1)
      expect(within(mainTable).getAllByText('Waste Collection Services').length).toBeGreaterThanOrEqual(1)
      expect(within(mainTable).getAllByText('Road Resurfacing Programme').length).toBeGreaterThanOrEqual(1)
    })

    it('renders sortable column headers', () => {
      renderComponent()
      expect(screen.getByLabelText('Sort by Contract')).toBeInTheDocument()
      expect(screen.getByLabelText('Sort by Published')).toBeInTheDocument()
      expect(screen.getByLabelText('Sort by Value')).toBeInTheDocument()
    })

    it('renders status badges on each contract row', () => {
      renderComponent()
      const badges = document.querySelectorAll('.procurement-status-badge')
      expect(badges.length).toBe(8)
    })

    it('renders external link for contracts with URLs', () => {
      renderComponent()
      const links = screen.getAllByLabelText(/View .* on Contracts Finder/)
      expect(links.length).toBeGreaterThan(0)
    })

    it('does not render external link for contracts without URL', () => {
      renderComponent()
      expect(screen.queryByLabelText(/View Catering Services Withdrawn on Contracts Finder/)).not.toBeInTheDocument()
    })

    it('displays awarded value for awarded contracts', () => {
      renderComponent()
      const amountCells = document.querySelectorAll('.amount-cell')
      expect(amountCells.length).toBeGreaterThan(0)
    })

    it('displays estimated value for non-awarded contracts with value_low', () => {
      renderComponent()
      // Multiple contracts may show "est." — use getAllByText
      const estElements = screen.getAllByText(/est\./)
      expect(estElements.length).toBeGreaterThanOrEqual(1)
    })

    it('renders supplier names as links', () => {
      renderComponent()
      const supplierLinks = screen.getAllByTitle('View supplier profile')
      expect(supplierLinks.length).toBeGreaterThan(0)
    })

    it('shows dash for contracts without supplier', () => {
      renderComponent()
      const dashes = screen.getAllByText('-')
      expect(dashes.length).toBeGreaterThan(0)
    })
  })

  // ─── Sorting ────────────────────────────────────────────

  describe('Sorting', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    })

    it('sorts by published date descending by default', () => {
      renderComponent()
      const publishedHeader = screen.getByLabelText('Sort by Published')
      expect(publishedHeader).toHaveAttribute('aria-sort', 'descending')
    })

    it('toggles sort direction when clicking same column', () => {
      renderComponent()
      const publishedHeader = screen.getByLabelText('Sort by Published')
      fireEvent.click(publishedHeader)
      expect(publishedHeader).toHaveAttribute('aria-sort', 'ascending')
    })

    it('sorts by title when clicking Contract column', () => {
      renderComponent()
      const titleHeader = screen.getByLabelText('Sort by Contract')
      fireEvent.click(titleHeader)
      expect(titleHeader).toHaveAttribute('aria-sort', 'descending')
    })

    it('sorts by value when clicking Value column', () => {
      renderComponent()
      const valueHeader = screen.getByLabelText('Sort by Value')
      fireEvent.click(valueHeader)
      expect(valueHeader).toHaveAttribute('aria-sort', 'descending')
    })

    it('maintains all contracts after sort change', () => {
      renderComponent()
      fireEvent.click(screen.getByLabelText('Sort by Contract'))
      const resultsSpan = document.querySelector('.procurement-filter-results')
      expect(resultsSpan.textContent).toContain('8')
    })
  })

  // ─── Status Filter ──────────────────────────────────────

  describe('Status Filter', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    })

    it('renders status filter dropdown', () => {
      renderComponent()
      expect(screen.getByLabelText('Status')).toBeInTheDocument()
      expect(screen.getByText('All Statuses')).toBeInTheDocument()
    })

    it('filters by awarded status', () => {
      renderComponent()
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'awarded' } })
      const resultsSpan = document.querySelector('.procurement-filter-results')
      expect(resultsSpan.textContent).toContain('6')
    })

    it('filters by open status', () => {
      renderComponent()
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'open' } })
      const mainTable = getMainTable()
      expect(within(mainTable).getAllByText('IT Support Contract').length).toBeGreaterThanOrEqual(1)
      expect(within(mainTable).queryByText('Office Cleaning Services')).not.toBeInTheDocument()
    })

    it('filters by withdrawn status', () => {
      renderComponent()
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'withdrawn' } })
      const mainTable = getMainTable()
      expect(within(mainTable).getAllByText('Catering Services Withdrawn').length).toBeGreaterThanOrEqual(1)
      const resultsSpan = document.querySelector('.procurement-filter-results')
      expect(resultsSpan.textContent).toBe('1 contract')
    })
  })

  // ─── Advanced Filters ───────────────────────────────────

  describe('Advanced Filters', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    })

    it('renders advanced filters toggle button', () => {
      renderComponent()
      expect(screen.getByText(/Advanced/)).toBeInTheDocument()
    })

    it('expands advanced filters when clicked', () => {
      renderComponent()
      fireEvent.click(screen.getByText(/Advanced/))
      expect(screen.getByLabelText('Service Type')).toBeInTheDocument()
      expect(screen.getByLabelText('Year Published')).toBeInTheDocument()
      expect(screen.getByLabelText('Min Value')).toBeInTheDocument()
      expect(screen.getByLabelText('Max Value')).toBeInTheDocument()
    })

    it('collapses advanced filters when clicked again', () => {
      renderComponent()
      fireEvent.click(screen.getByText(/Advanced/))
      expect(screen.getByLabelText('Service Type')).toBeInTheDocument()
      fireEvent.click(screen.getByText(/Advanced/))
      expect(screen.queryByLabelText('Service Type')).not.toBeInTheDocument()
    })

    it('filters by CPV service type', () => {
      renderComponent()
      fireEvent.click(screen.getByText(/Advanced/))
      fireEvent.change(screen.getByLabelText('Service Type'), { target: { value: 'Cleaning services' } })
      const mainTable = getMainTable()
      expect(within(mainTable).getAllByText('Office Cleaning Services').length).toBeGreaterThanOrEqual(1)
      expect(within(mainTable).queryByText('IT Support Contract')).not.toBeInTheDocument()
    })

    it('filters by year published', () => {
      renderComponent()
      fireEvent.click(screen.getByText(/Advanced/))
      fireEvent.change(screen.getByLabelText('Year Published'), { target: { value: '2024' } })
      const mainTable = getMainTable()
      expect(within(mainTable).getAllByText('Waste Collection Services').length).toBeGreaterThanOrEqual(1)
      expect(within(mainTable).queryByText('IT Support Contract')).not.toBeInTheDocument()
    })

    it('filters by minimum value', () => {
      renderComponent()
      fireEvent.click(screen.getByText(/Advanced/))
      fireEvent.change(screen.getByLabelText('Min Value'), { target: { value: '100000' } })
      const mainTable = getMainTable()
      expect(within(mainTable).getAllByText('Road Resurfacing Programme').length).toBeGreaterThanOrEqual(1)
      expect(within(mainTable).queryByText('Waste Collection Services')).not.toBeInTheDocument()
    })

    it('filters by maximum value', () => {
      renderComponent()
      fireEvent.click(screen.getByText(/Advanced/))
      fireEvent.change(screen.getByLabelText('Max Value'), { target: { value: '60000' } })
      const mainTable = getMainTable()
      expect(within(mainTable).getAllByText('Waste Collection Services').length).toBeGreaterThanOrEqual(1)
      expect(within(mainTable).queryByText('Road Resurfacing Programme')).not.toBeInTheDocument()
    })

    it('combines multiple filters', () => {
      renderComponent()
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'awarded' } })
      fireEvent.change(screen.getByPlaceholderText(/search contracts/i), { target: { value: 'ACME' } })
      const mainTable = getMainTable()
      expect(within(mainTable).getAllByText('Office Cleaning Services').length).toBeGreaterThanOrEqual(1)
      expect(within(mainTable).queryByText('IT Support Contract')).not.toBeInTheDocument()
      expect(within(mainTable).queryByText('Waste Collection Services')).not.toBeInTheDocument()
    })

    it('shows active filter count badge', () => {
      renderComponent()
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'awarded' } })
      expect(screen.getByText(/Advanced \(1\)/)).toBeInTheDocument()
    })

    it('clears all filters', () => {
      renderComponent()
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'awarded' } })
      fireEvent.change(screen.getByPlaceholderText(/search contracts/i), { target: { value: 'test' } })
      fireEvent.click(screen.getByText('Clear All'))
      const resultsSpan = document.querySelector('.procurement-filter-results')
      expect(resultsSpan.textContent).toContain('8')
    })
  })

  // ─── Expandable Contract Detail ─────────────────────────

  describe('Contract Detail (Expandable Rows)', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    })

    it('expands row when clicked', () => {
      renderComponent()
      const mainTable = getMainTable()
      const rows = mainTable.querySelectorAll('.procurement-row')
      // Click any row (all have the same structure)
      const row = rows[0]
      fireEvent.click(row)
      expect(row).toHaveAttribute('aria-expanded', 'true')
    })

    it('shows description in expanded view', () => {
      renderComponent()
      const mainTable = getMainTable()
      // Find the row containing "Office Cleaning Services"
      const titleCells = within(mainTable).getAllByText('Office Cleaning Services')
      const row = titleCells[0].closest('tr')
      fireEvent.click(row)
      expect(screen.getByText('Regular cleaning of council offices')).toBeInTheDocument()
    })

    it('shows timeline in expanded view', () => {
      renderComponent()
      const mainTable = getMainTable()
      const titleCells = within(mainTable).getAllByText('Office Cleaning Services')
      fireEvent.click(titleCells[0].closest('tr'))
      const timelineLabels = screen.getAllByText('Published')
      expect(timelineLabels.length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Deadline')).toBeInTheDocument()
    })

    it('shows contract start and end dates in timeline', () => {
      renderComponent()
      const mainTable = getMainTable()
      const titleCells = within(mainTable).getAllByText('Office Cleaning Services')
      fireEvent.click(titleCells[0].closest('tr'))
      expect(screen.getByText('Contract Start')).toBeInTheDocument()
      expect(screen.getByText('Contract End')).toBeInTheDocument()
    })

    it('shows procedure type tag in expanded view', () => {
      renderComponent()
      const mainTable = getMainTable()
      const titleCells = within(mainTable).getAllByText('Office Cleaning Services')
      fireEvent.click(titleCells[0].closest('tr'))
      expect(screen.getByText(/Procedure: Open/)).toBeInTheDocument()
    })

    it('shows SME tag in expanded view', () => {
      renderComponent()
      const mainTable = getMainTable()
      const titleCells = within(mainTable).getAllByText('Office Cleaning Services')
      fireEvent.click(titleCells[0].closest('tr'))
      expect(screen.getByText('SME')).toBeInTheDocument()
    })

    it('shows Non-SME tag for non-SME contracts', () => {
      renderComponent()
      const mainTable = getMainTable()
      const titleCells = within(mainTable).getAllByText('Road Resurfacing Programme')
      fireEvent.click(titleCells[0].closest('tr'))
      expect(screen.getByText('Non-SME')).toBeInTheDocument()
    })

    it('shows bid count tag', () => {
      renderComponent()
      const mainTable = getMainTable()
      const titleCells = within(mainTable).getAllByText('Office Cleaning Services')
      fireEvent.click(titleCells[0].closest('tr'))
      expect(screen.getByText(/Bids: 4/)).toBeInTheDocument()
    })

    it('shows bid count with warning emoji for single bid', () => {
      renderComponent()
      const mainTable = getMainTable()
      const titleCells = within(mainTable).getAllByText('Waste Collection Services')
      fireEvent.click(titleCells[0].closest('tr'))
      expect(screen.getByText(/Bids: 1 ⚠️/)).toBeInTheDocument()
    })

    it('shows View on Contracts Finder link', () => {
      renderComponent()
      const mainTable = getMainTable()
      const titleCells = within(mainTable).getAllByText('Office Cleaning Services')
      fireEvent.click(titleCells[0].closest('tr'))
      expect(screen.getByText('View on Contracts Finder')).toBeInTheDocument()
    })

    it('shows View Spending button for awarded supplier', () => {
      renderComponent()
      const mainTable = getMainTable()
      const titleCells = within(mainTable).getAllByText('Office Cleaning Services')
      fireEvent.click(titleCells[0].closest('tr'))
      expect(screen.getByText(/View Spending for ACME Services Ltd/)).toBeInTheDocument()
    })

    it('collapses when same row clicked again', () => {
      renderComponent()
      const mainTable = getMainTable()
      const row = mainTable.querySelector('.procurement-row')
      fireEvent.click(row)
      expect(row).toHaveAttribute('aria-expanded', 'true')
      fireEvent.click(row)
      expect(row).toHaveAttribute('aria-expanded', 'false')
    })

    it('keyboard Enter expands row', () => {
      renderComponent()
      const mainTable = getMainTable()
      const row = mainTable.querySelector('.procurement-row')
      fireEvent.keyDown(row, { key: 'Enter' })
      expect(row).toHaveAttribute('aria-expanded', 'true')
    })

    it('keyboard Space expands row', () => {
      renderComponent()
      const mainTable = getMainTable()
      const row = mainTable.querySelector('.procurement-row')
      fireEvent.keyDown(row, { key: ' ' })
      expect(row).toHaveAttribute('aria-expanded', 'true')
    })
  })

  // ─── Top Suppliers ──────────────────────────────────────

  describe('Top Suppliers', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    })

    it('renders top suppliers section', () => {
      renderComponent()
      expect(screen.getByText('Top Suppliers')).toBeInTheDocument()
    })

    it('displays supplier names', () => {
      renderComponent()
      const acmeElements = screen.getAllByText('ACME Services Ltd')
      expect(acmeElements.length).toBeGreaterThanOrEqual(1)
      const widgetElements = screen.getAllByText('Widget Corp')
      expect(widgetElements.length).toBeGreaterThanOrEqual(1)
    })

    it('excludes NOT AWARDED TO SUPPLIER from top suppliers list', () => {
      renderComponent()
      const topSuppliersSection = screen.getByText('Top Suppliers').closest('.procurement-top-suppliers')
      expect(within(topSuppliersSection).queryByText('NOT AWARDED TO SUPPLIER')).not.toBeInTheDocument()
    })

    it('shows supplier rank numbers', () => {
      renderComponent()
      const topSuppliersSection = screen.getByText('Top Suppliers').closest('.procurement-top-suppliers')
      expect(within(topSuppliersSection).getByText('#1')).toBeInTheDocument()
      expect(within(topSuppliersSection).getByText('#2')).toBeInTheDocument()
    })

    it('shows contract count and value for each supplier', () => {
      renderComponent()
      const matches = screen.getAllByText(/4 contracts/)
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ─── Competition Intelligence ───────────────────────────

  describe('Competition Intelligence', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    })

    it('renders Competition Intelligence section when bid data exists', () => {
      renderComponent()
      expect(screen.getByText('Competition Intelligence')).toBeInTheDocument()
    })

    it('does not render Competition Intelligence when no bid data', () => {
      const noBidData = {
        ...mockProcurementData,
        contracts: mockProcurementData.contracts.map(c => ({ ...c, bid_count: undefined })),
      }
      useData.mockReturnValue({ data: noBidData, loading: false, error: null })
      renderComponent()
      expect(screen.queryByText('Competition Intelligence')).not.toBeInTheDocument()
    })

    it('displays average bids per contract label', () => {
      renderComponent()
      expect(screen.getByText('Avg Bids/Contract')).toBeInTheDocument()
    })

    it('calculates correct average bids', () => {
      renderComponent()
      // Avg of [4, 1, 3, 2, 1, 5] = 16/6 = 2.7
      const compSection = screen.getByText('Competition Intelligence').closest('.procurement-competition-section')
      expect(within(compSection).getByText('2.7')).toBeInTheDocument()
    })

    it('displays single bidder rate', () => {
      renderComponent()
      expect(screen.getByText('Single Bidder Rate')).toBeInTheDocument()
      // 2 single-bid out of 6 with bid data = 33%
      const compSection = screen.getByText('Competition Intelligence').closest('.procurement-competition-section')
      expect(within(compSection).getByText('33%')).toBeInTheDocument()
    })

    it('displays single-bid value label', () => {
      renderComponent()
      expect(screen.getByText('Single-Bid Value')).toBeInTheDocument()
    })

    it('displays repeat winners count', () => {
      renderComponent()
      expect(screen.getByText('Repeat Winners (3+)')).toBeInTheDocument()
    })

    it('shows repeat winners with win counts', () => {
      renderComponent()
      expect(screen.getByText('Repeat Winners')).toBeInTheDocument()
      expect(screen.getByText('4×')).toBeInTheDocument()
    })

    it('shows repeat winners description text', () => {
      renderComponent()
      expect(screen.getByText(/Suppliers awarded 3 or more contracts/)).toBeInTheDocument()
    })

    it('applies red colour to high single-bidder rate', () => {
      renderComponent()
      const singleBidCard = screen.getByText('Single Bidder Rate').closest('.procurement-stat-card')
      const icon = singleBidCard.querySelector('.procurement-stat-icon')
      expect(icon.style.background).toMatch(/255,\s*69,\s*58/)
    })

    it('applies green colour to low single-bidder rate', () => {
      const lowSingleBid = {
        ...mockProcurementData,
        contracts: mockProcurementData.contracts.map(c => ({
          ...c,
          bid_count: c.status === 'awarded' ? 5 : undefined,
        })),
      }
      useData.mockReturnValue({ data: lowSingleBid, loading: false, error: null })
      renderComponent()
      const singleBidCard = screen.getByText('Single Bidder Rate').closest('.procurement-stat-card')
      const icon = singleBidCard.querySelector('.procurement-stat-icon')
      expect(icon.style.background).toMatch(/48,\s*209,\s*88/)
    })
  })

  // ─── Expiring Contracts ─────────────────────────────────

  describe('Expiring Contracts', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    })

    it('renders expiring contracts section', () => {
      renderComponent()
      expect(screen.getByText('Expiring Soon')).toBeInTheDocument()
    })

    it('shows count of expiring contracts', () => {
      renderComponent()
      expect(screen.getByText(/contract.*expiring within 6 months/)).toBeInTheDocument()
    })

    it('shows contract titles in expiring section', () => {
      renderComponent()
      const expiringSection = screen.getByText('Expiring Soon').closest('.procurement-expiring-section')
      // contract-1 (in 15 days) should be there
      expect(within(expiringSection).getByText('Office Cleaning Services')).toBeInTheDocument()
    })

    it('shows supplier names in expiring section', () => {
      renderComponent()
      const expiringSection = screen.getByText('Expiring Soon').closest('.procurement-expiring-section')
      expect(within(expiringSection).getAllByText('ACME Services Ltd').length).toBeGreaterThanOrEqual(1)
    })

    it('shows imminent expiry badge for contracts expiring within 30 days', () => {
      renderComponent()
      const badges = document.querySelectorAll('.expiry-imminent')
      expect(badges.length).toBeGreaterThan(0)
    })

    it('shows soon expiry badge for contracts expiring within 90 days', () => {
      renderComponent()
      const badges = document.querySelectorAll('.expiry-soon')
      expect(badges.length).toBeGreaterThan(0)
    })

    it('shows upcoming expiry badge for contracts expiring within 6 months', () => {
      renderComponent()
      const badges = document.querySelectorAll('.expiry-upcoming')
      expect(badges.length).toBeGreaterThan(0)
    })

    it('excludes past-date contracts from expiring section', () => {
      renderComponent()
      const expiringSection = screen.getByText('Expiring Soon').closest('.procurement-expiring-section')
      expect(within(expiringSection).queryByText(/Gardens/)).not.toBeInTheDocument()
    })

    it('excludes contracts beyond 6 months from expiring section', () => {
      renderComponent()
      const expiringSection = screen.getByText('Expiring Soon').closest('.procurement-expiring-section')
      expect(within(expiringSection).queryByText('Leisure Centre Management')).not.toBeInTheDocument()
    })

    it('does not render expiring section when no contracts expire soon', () => {
      const noExpiryData = {
        ...mockProcurementData,
        contracts: mockProcurementData.contracts.map(c => ({ ...c, contract_end: undefined })),
      }
      useData.mockReturnValue({ data: noExpiryData, loading: false, error: null })
      renderComponent()
      expect(screen.queryByText('Expiring Soon')).not.toBeInTheDocument()
    })

    it('shows days remaining in expiry badge', () => {
      renderComponent()
      const expiringSection = screen.getByText('Expiring Soon').closest('.procurement-expiring-section')
      const badges = expiringSection.querySelectorAll('.expiry-badge')
      badges.forEach(badge => {
        expect(badge.textContent).toMatch(/\d+d\)/)
      })
    })
  })

  // ─── CSV Export ─────────────────────────────────────────

  describe('CSV Export', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    })

    it('renders CSV export button', () => {
      renderComponent()
      expect(screen.getByText('CSV')).toBeInTheDocument()
    })

    it('export button has tooltip', () => {
      renderComponent()
      const exportBtn = screen.getByText('CSV').closest('button')
      expect(exportBtn).toHaveAttribute('title', 'Export filtered contracts as CSV')
    })

    it('triggers download when clicked', () => {
      const createObjectURL = vi.fn(() => 'blob:test')
      const revokeObjectURL = vi.fn()
      global.URL.createObjectURL = createObjectURL
      global.URL.revokeObjectURL = revokeObjectURL

      const clickSpy = vi.fn()
      const createElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = createElement(tag)
        if (tag === 'a') {
          Object.defineProperty(el, 'click', { value: clickSpy })
        }
        return el
      })

      renderComponent()
      fireEvent.click(screen.getByText('CSV').closest('button'))

      expect(createObjectURL).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURL).toHaveBeenCalledTimes(1)

      document.createElement.mockRestore()
    })
  })

  // ─── Single Bid Warning ─────────────────────────────────

  describe('Single Bid Warning', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    })

    it('shows warning icon for single-bid contracts in table', () => {
      renderComponent()
      const warnings = document.querySelectorAll('.single-bid-warning')
      // contract-3 and contract-6 have bid_count: 1
      expect(warnings.length).toBe(2)
    })

    it('warning has tooltip text', () => {
      renderComponent()
      const warnings = document.querySelectorAll('.single-bid-warning')
      expect(warnings[0]).toHaveAttribute('title', 'Single bidder — no competition')
    })

    it('does not show warning for multi-bid contracts', () => {
      renderComponent()
      const warnings = document.querySelectorAll('.single-bid-warning')
      expect(warnings.length).toBe(2)
    })
  })

  // ─── HTML Entity Decoding ──────────────────────────────

  describe('HTML Entity Decoding', () => {
    it('decodes &amp; in supplier names', () => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
      renderComponent()
      // Supplier names go through decodeHtmlEntities — "Smith &amp; Sons" → "Smith & Sons"
      const decoded = screen.getAllByText(/Smith & Sons/)
      expect(decoded.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ─── Pagination ─────────────────────────────────────────

  describe('Pagination', () => {
    it('does not show pagination when contracts fit on one page', () => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
      renderComponent()
      expect(screen.queryByText(/Page \d+ of/)).not.toBeInTheDocument()
    })

    it('shows pagination when contracts exceed page size', () => {
      const manyContracts = Array.from({ length: 30 }, (_, i) => ({
        id: `contract-${i}`,
        title: `Contract ${i}`,
        status: 'awarded',
        published_date: '2025-01-01',
        awarded_supplier: 'Supplier A',
        awarded_value: 10000,
        url: `https://example.com/${i}`,
      }))
      const bigData = {
        ...mockProcurementData,
        stats: { ...mockProcurementData.stats, total_notices: 30 },
        contracts: manyContracts,
      }
      useData.mockReturnValue({ data: bigData, loading: false, error: null })
      renderComponent()
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    })

    it('navigates to next page', () => {
      const manyContracts = Array.from({ length: 30 }, (_, i) => ({
        id: `contract-${i}`,
        title: `Contract ${i}`,
        status: 'awarded',
        published_date: '2025-01-01',
        awarded_supplier: 'Supplier A',
        awarded_value: 10000,
        url: `https://example.com/${i}`,
      }))
      useData.mockReturnValue({
        data: { ...mockProcurementData, stats: { ...mockProcurementData.stats, total_notices: 30 }, contracts: manyContracts },
        loading: false, error: null
      })
      renderComponent()
      fireEvent.click(screen.getByText(/Next/))
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    })

    it('disables Prev button on first page', () => {
      const manyContracts = Array.from({ length: 30 }, (_, i) => ({
        id: `contract-${i}`,
        title: `Contract ${i}`,
        status: 'awarded',
        published_date: '2025-01-01',
        awarded_supplier: 'Supplier A',
        awarded_value: 10000,
        url: `https://example.com/${i}`,
      }))
      useData.mockReturnValue({
        data: { ...mockProcurementData, stats: { ...mockProcurementData.stats, total_notices: 30 }, contracts: manyContracts },
        loading: false, error: null
      })
      renderComponent()
      expect(screen.getByText(/Prev/).closest('button')).toBeDisabled()
    })

    it('disables Next button on last page', () => {
      const manyContracts = Array.from({ length: 30 }, (_, i) => ({
        id: `contract-${i}`,
        title: `Contract ${i}`,
        status: 'awarded',
        published_date: '2025-01-01',
        awarded_supplier: 'Supplier A',
        awarded_value: 10000,
        url: `https://example.com/${i}`,
      }))
      useData.mockReturnValue({
        data: { ...mockProcurementData, stats: { ...mockProcurementData.stats, total_notices: 30 }, contracts: manyContracts },
        loading: false, error: null
      })
      renderComponent()
      fireEvent.click(screen.getByText(/Next/))
      expect(screen.getByText(/Next/).closest('button')).toBeDisabled()
    })
  })

  // ─── Charts ─────────────────────────────────────────────

  describe('Charts', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    })

    it('renders contracts-by-year chart when multiple years exist', () => {
      renderComponent()
      expect(screen.getAllByText('Contracts by Year').length).toBeGreaterThanOrEqual(1)
    })

    it('renders status pie chart when multiple statuses exist', () => {
      renderComponent()
      expect(screen.getAllByText('By Status').length).toBeGreaterThanOrEqual(1)
    })

    it('does not render year chart with only one year of data', () => {
      useData.mockReturnValue({
        data: { ...mockProcurementData, stats: { ...mockProcurementData.stats, by_year: { '2025': 3 } } },
        loading: false, error: null
      })
      renderComponent()
      expect(screen.queryByText('Contracts by Year')).not.toBeInTheDocument()
    })

    it('does not render status chart with only one status', () => {
      useData.mockReturnValue({
        data: { ...mockProcurementData, contracts: mockProcurementData.contracts.map(c => ({ ...c, status: 'awarded' })) },
        loading: false, error: null
      })
      renderComponent()
      expect(screen.queryByText('By Status')).not.toBeInTheDocument()
    })
  })

  // ─── Data Source Note ───────────────────────────────────

  describe('Data Source Note', () => {
    it('renders Contracts Finder attribution', () => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
      renderComponent()
      const sourceNote = document.querySelector('.procurement-source-note')
      expect(sourceNote).toBeTruthy()
      expect(sourceNote.textContent).toContain('Contracts Finder')
    })

    it('shows last updated date', () => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
      renderComponent()
      const sourceNote = document.querySelector('.procurement-source-note')
      expect(sourceNote.textContent).toContain('Last updated')
    })
  })

  // ─── Filter Result Count ────────────────────────────────

  describe('Filter Result Count', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
    })

    it('shows total contract count initially', () => {
      renderComponent()
      const resultsSpan = document.querySelector('.procurement-filter-results')
      expect(resultsSpan.textContent).toContain('8')
    })

    it('updates count when filters applied', () => {
      renderComponent()
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'open' } })
      const resultsSpan = document.querySelector('.procurement-filter-results')
      expect(resultsSpan.textContent).toBe('1 contract')
    })

    it('uses singular "contract" for count of 1', () => {
      renderComponent()
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'withdrawn' } })
      const resultsSpan = document.querySelector('.procurement-filter-results')
      expect(resultsSpan.textContent).toBe('1 contract')
    })
  })

  // ─── Value Display Fallback Chain ───────────────────────

  describe('Value Display', () => {
    it('shows awarded_value when available', () => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
      renderComponent()
      const amountCells = document.querySelectorAll('.amount-cell')
      expect(amountCells.length).toBeGreaterThan(0)
    })

    it('shows value_low as estimate when no awarded_value', () => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
      renderComponent()
      const estElements = screen.getAllByText(/est\./)
      expect(estElements.length).toBeGreaterThanOrEqual(1)
    })

    it('shows dash when no value at all', () => {
      useData.mockReturnValue({
        data: {
          ...mockProcurementData,
          contracts: [{
            id: 'no-val',
            title: 'No Value Contract',
            status: 'open',
            published_date: '2025-01-01',
            awarded_value: null,
            value_low: null,
            url: 'https://example.com',
          }],
        },
        loading: false, error: null
      })
      renderComponent()
      const dashes = screen.getAllByText('-')
      expect(dashes.length).toBeGreaterThan(0)
    })
  })

  // ─── Edge Cases ─────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles missing stats gracefully', () => {
      useData.mockReturnValue({ data: { ...mockProcurementData, stats: {} }, loading: false, error: null })
      renderComponent()
      expect(screen.getByText('Public Contracts')).toBeInTheDocument()
    })

    it('handles missing meta gracefully', () => {
      useData.mockReturnValue({ data: { ...mockProcurementData, meta: {} }, loading: false, error: null })
      renderComponent()
      expect(screen.getByText('Public Contracts')).toBeInTheDocument()
    })

    it('handles contract without description in expanded view', () => {
      useData.mockReturnValue({
        data: {
          ...mockProcurementData,
          contracts: [{
            id: 'no-desc',
            title: 'Minimal Contract',
            status: 'awarded',
            published_date: '2025-01-01',
            awarded_supplier: 'Test Supplier',
            awarded_value: 10000,
            url: 'https://example.com',
          }],
        },
        loading: false, error: null
      })
      renderComponent()
      fireEvent.click(screen.getByText('Minimal Contract').closest('tr'))
      expect(screen.queryByText('Description')).not.toBeInTheDocument()
    })

    it('handles contract without timeline dates', () => {
      useData.mockReturnValue({
        data: {
          ...mockProcurementData,
          contracts: [{
            id: 'no-timeline',
            title: 'No Timeline Contract',
            status: 'open',
            awarded_supplier: null,
            url: 'https://example.com',
          }],
        },
        loading: false, error: null
      })
      renderComponent()
      fireEvent.click(screen.getByText('No Timeline Contract').closest('tr'))
      expect(screen.queryByText('Timeline')).not.toBeInTheDocument()
    })

    it('correctly loads data from useData hook with correct path', () => {
      useData.mockReturnValue({ data: mockProcurementData, loading: false, error: null })
      renderComponent()
      expect(useData).toHaveBeenCalledWith('/data/procurement.json')
    })
  })
})
