import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Legal from './Legal'

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

import { useCouncilConfig } from '../context/CouncilConfig'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Legal />
    </MemoryRouter>
  )
}

describe('Legal', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('renders legal page heading', () => {
    renderComponent()
    expect(screen.getByText('Legal Information')).toBeInTheDocument()
  })

  it('renders disclaimer tab by default', () => {
    renderComponent()
    expect(screen.getByText(/important disclaimer/i)).toBeInTheDocument()
  })

  it('shows council name in content', () => {
    renderComponent()
    const matches = screen.getAllByText(/burnley borough council/i)
    expect(matches.length).toBeGreaterThan(0)
  })
})
