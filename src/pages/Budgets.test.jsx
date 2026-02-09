import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Budgets from './Budgets'

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
  data_sources: { budgets: true },
}

const mockBudgetData = {
  revenue_budgets: [{
    financial_year: '2024/25',
    net_revenue_budget: 1000000,
    departments: { Finance: 500000 },
    council_tax: { burnley_element: 1500 },
    funding_sources: {},
  }],
  capital_programmes: [],
  treasury_and_investment: {},
  insights: {},
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Budgets />
    </MemoryRouter>
  )
}

describe('Budgets', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading budget data/i)).toBeInTheDocument()
  })

  it('shows error state', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
  })

  it('renders budget page heading with data', () => {
    useData.mockReturnValue({
      data: [mockBudgetData, null],
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText('Budget Analysis')).toBeInTheDocument()
  })
})
