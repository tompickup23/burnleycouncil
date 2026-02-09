import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Spending from './Spending'

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
  spending_data_period: 'April 2021 – present',
}

const mockSpendingData = [
  {
    date: '2025-01-15',
    supplier: 'ACME Corp',
    amount: 5000,
    type: 'revenue',
    financial_year: '2024/25',
    service_division: 'Finance',
    expenditure_category: 'Consulting',
    capital_revenue: 'revenue',
    description: 'Consulting services',
  },
  {
    date: '2025-02-01',
    supplier: 'Widget Ltd',
    amount: 2500,
    type: 'revenue',
    financial_year: '2024/25',
    service_division: 'IT',
    expenditure_category: 'Software',
    capital_revenue: 'revenue',
    description: 'Software license',
  },
]

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
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading spending data/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
  })

  it('renders spending page heading with data', () => {
    useData.mockReturnValue({
      data: mockSpendingData,
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText('Spending Explorer')).toBeInTheDocument()
    expect(screen.getByText(/2 council transactions/)).toBeInTheDocument()
  })

  it('shows search and filter controls', () => {
    useData.mockReturnValue({
      data: mockSpendingData,
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByLabelText(/search spending records/i)).toBeInTheDocument()
    expect(screen.getByText('Filters')).toBeInTheDocument()
  })

  it('renders with empty data array without crashing', () => {
    useData.mockReturnValue({ data: [], loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Spending Explorer')).toBeInTheDocument()
    expect(screen.getByText(/0 council transactions/)).toBeInTheDocument()
  })
})
