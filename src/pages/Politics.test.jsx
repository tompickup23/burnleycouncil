import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Politics from './Politics'

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

const mockData = [
  [{ id: 1, name: 'Test Councillor', party: 'Labour', ward: 'Test Ward' }],
  { total_wards: 15, total_councillors: 45, by_party: [], coalition: null },
  {},
]

function renderComponent() {
  return render(
    <MemoryRouter>
      <Politics />
    </MemoryRouter>
  )
}

describe('Politics', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state while data loads', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading councillor data/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
  })

  it('renders the page heading with data', () => {
    useData.mockReturnValue({ data: mockData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Council Politics')).toBeInTheDocument()
  })

  it('renders councillor name from data', () => {
    useData.mockReturnValue({ data: mockData, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Test Councillor')).toBeInTheDocument()
  })
})
