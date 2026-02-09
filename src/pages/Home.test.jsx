import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from './Home'

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
  hero_subtitle: null,
  data_sources: {
    doge_investigation: true,
    politics: true,
    news: true,
    budget_trends: true,
  },
}

const mockInsights = {
  summary: {
    total_spend: 150000000,
    transaction_count: 25000,
    unique_suppliers: 3000,
    date_range: { min: '2021-04-01', max: '2025-12-31' },
  },
  supplier_analysis: {
    top_20_suppliers: [
      { supplier: 'ACME Corp Ltd', total: 5000000, transactions: 100 },
      { supplier: 'Widget Services', total: 3000000, transactions: 50 },
    ],
    concentration_ratio: 0.45,
  },
  yoy_analysis: {
    spend_by_year: { '2022': 30000000, '2023': 35000000, '2024': 40000000 },
  },
}

function renderComponent(config = mockConfig) {
  useCouncilConfig.mockReturnValue(config)
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  )
}

describe('Home', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state while data loads', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading dashboard data/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('network error') })
    renderComponent()
    expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
  })

  it('renders hero section with council data', () => {
    useData.mockReturnValue({
      data: [mockInsights, { findings: [], key_findings: [] }, { by_party: [] }, [], null],
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText(/your money/i)).toBeInTheDocument()
    expect(screen.getByText(/your right to know/i)).toBeInTheDocument()
  })

  it('renders disclaimer banner', () => {
    useData.mockReturnValue({
      data: [mockInsights, { findings: [], key_findings: [] }, { by_party: [] }, [], null],
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText(/independent transparency tool/i)).toBeInTheDocument()
  })

  it('shows formatted total spend', () => {
    useData.mockReturnValue({
      data: [mockInsights, { findings: [], key_findings: [] }, { by_party: [] }, [], null],
      loading: false,
      error: null,
    })
    renderComponent()
    // £150M should be formatted in some way
    expect(screen.getByText(/£150/)).toBeInTheDocument()
  })

  it('renders with minimal config (no optional data sources)', () => {
    const minimalConfig = {
      ...mockConfig,
      data_sources: {},
    }
    useData.mockReturnValue({
      data: [mockInsights],
      loading: false,
      error: null,
    })
    renderComponent(minimalConfig)
    expect(screen.getByText(/your money/i)).toBeInTheDocument()
  })
})
