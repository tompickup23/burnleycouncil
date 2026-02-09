import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FOI from './FOI'

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

const mockFoiData = {
  categories: [{
    id: 'spending',
    name: 'Spending & Contracts',
    description: 'Requests about council spending',
    templates: [{
      title: 'Test FOI Template',
      why: 'Test reason',
      template: 'Test body',
    }],
  }],
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <FOI />
    </MemoryRouter>
  )
}

describe('FOI', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading foi templates/i)).toBeInTheDocument()
  })

  it('shows error state', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
  })

  it('renders FOI page heading with data', () => {
    useData.mockReturnValue({
      data: mockFoiData,
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText('Freedom of Information')).toBeInTheDocument()
  })
})
