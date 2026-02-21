import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SupplierView from './SupplierView'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(),
  }
})

// Recharts uses browser APIs not available in jsdom; stub chart components
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="chart">{children}</div>,
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useParams } from 'react-router-dom'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
}

const mockProfilesData = {
  profiles: [
    {
      id: 'acme-corp',
      name: 'ACME Corp',
      canonical: 'ACME CORP',
      spending: { total_all_councils: 50000, transaction_count: 10, avg_payment: 5000, max_payment: 15000, councils_count: 2 },
      companies_house: { company_number: '12345678', legal_name: 'ACME Corp Ltd', status: 'active' },
      compliance: { risk_level: 'low', violation_count: 0 },
    },
  ],
}

function renderComponent() {
  return render(
    <MemoryRouter initialEntries={['/supplier/acme-corp']}>
      <SupplierView />
    </MemoryRouter>
  )
}

describe('SupplierView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
    useParams.mockReturnValue({ supplierId: 'acme-corp' })
  })

  it('shows loading state while data loads', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading supplier profile/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/unable to load supplier data/i)).toBeInTheDocument()
  })

  it('renders supplier name with data', () => {
    useData.mockReturnValue({ data: mockProfilesData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('ACME Corp')).toBeInTheDocument()
  })

  it('shows supplier not found when profile does not exist', () => {
    useParams.mockReturnValue({ supplierId: 'nonexistent' })
    useData.mockReturnValue({ data: mockProfilesData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Supplier not found')).toBeInTheDocument()
  })
})
