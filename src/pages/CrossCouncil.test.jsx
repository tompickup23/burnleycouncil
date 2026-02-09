import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CrossCouncil from './CrossCouncil'

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

const mockCrossCouncilData = {
  councils: [{
    council_id: 'burnley',
    council_name: 'Burnley',
    total_spend: 355000000,
    total_records: 30580,
    unique_suppliers: 1200,
    population: 88000,
    transparency: { has_dates: 100, has_suppliers: 95, has_departments: 80 },
  }],
  generated: '2025-02-01',
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <CrossCouncil />
    </MemoryRouter>
  )
}

describe('CrossCouncil', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading comparison data/i)).toBeInTheDocument()
  })

  it('shows error state', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
  })

  it('renders cross-council page heading with data', () => {
    useData.mockReturnValue({
      data: mockCrossCouncilData,
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText('Cross-Council Comparison')).toBeInTheDocument()
  })
})
