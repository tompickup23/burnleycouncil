import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Suppliers from './Suppliers'

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

const mockProfilesData = {
  profiles: [
    {
      id: 'acme-corp',
      name: 'ACME Corp',
      canonical: 'ACME CORP',
      spending: { total_all_councils: 50000, transaction_count: 10, councils_count: 2 },
      companies_house: { company_number: '12345678', legal_name: 'ACME Corp Ltd', status: 'active' },
      compliance: { risk_level: 'low', violation_count: 0 },
    },
    {
      id: 'widget-ltd',
      name: 'Widget Ltd',
      canonical: 'WIDGET LTD',
      spending: { total_all_councils: 25000, transaction_count: 5, councils_count: 1 },
      companies_house: null,
      compliance: { risk_level: 'clean', violation_count: 0 },
    },
  ],
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Suppliers />
    </MemoryRouter>
  )
}

describe('Suppliers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state while data loads', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading supplier profiles/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
  })

  it('renders the page heading with data', () => {
    useData.mockReturnValue({ data: mockProfilesData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Supplier Directory')).toBeInTheDocument()
  })

  it('renders supplier names in table', () => {
    useData.mockReturnValue({ data: mockProfilesData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('ACME Corp')).toBeInTheDocument()
    expect(screen.getByText('Widget Ltd')).toBeInTheDocument()
  })
})
