import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LGRCostCalculator from './LGRCostCalculator'

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
  council_tier: 'district',
}

const mockLgrData = {
  meta: { consultation_closes: '2026-04-01' },
  overview: { title: 'Lancashire LGR' },
  proposed_models: [{
    id: 'gov-2u',
    name: 'Government 2-Unitary',
    short_name: '2 UA',
    submitted_by: 'Government',
    doge_annual_savings: 5000000,
    authorities: [{ name: 'East Lancashire', population: 800000, councils: ['burnley'], notes: 'Test' }],
  }],
}

const mockBudgetsSummary = {
  council_tax: {
    band_d_by_year: { '2024-25': 1800 },
    band_d_total_by_year: { '2024-25': 2200 },
  },
  headline: {
    total_service_expenditure: 18700000,
    net_revenue_expenditure: 15000000,
  },
  service_breakdown: { 'Housing': 5000000, 'Planning': 3000000 },
  reserves: { total_closing: 2000000 },
}

const mockBudgetModel = {
  council_tax_harmonisation: {
    'gov-2u': {
      lcc_band_d_element: 1735.79,
      authorities: [{
        name: 'East Lancashire',
        harmonised_band_d: 1997.65,
        councils: [{ council_id: 'burnley', name: 'Burnley', current_combined_element: 2080.37, harmonised_band_d: 1997.65, delta: -82.72, winner: true }]
      }]
    }
  }
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <LGRCostCalculator />
    </MemoryRouter>
  )
}

describe('LGRCostCalculator', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state while data loads', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
  })

  it('renders the page heading with data', () => {
    useData.mockReturnValue({ data: [mockLgrData, mockBudgetsSummary, mockBudgetModel], loading: false, error: null })
    renderComponent()
    expect(screen.getByText(/LGR Cost/i)).toBeInTheDocument()
  })
})
