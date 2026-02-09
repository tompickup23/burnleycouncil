import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Meetings from './Meetings'

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

const mockMeetingsData = {
  meetings: [{
    id: 'mtg-1',
    title: 'Full Council',
    committee: 'Full Council',
    type: 'full_council',
    date: '2025-03-01',
    time: '18:00',
    cancelled: false,
    summary: 'Regular full council meeting',
  }],
  last_updated: '2025-02-01',
  how_to_attend: {},
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Meetings />
    </MemoryRouter>
  )
}

describe('Meetings', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading meetings calendar/i)).toBeInTheDocument()
  })

  it('shows error state', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/meetings calendar/i)).toBeInTheDocument()
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
  })

  it('renders meetings page heading with data', () => {
    useData.mockReturnValue({
      data: mockMeetingsData,
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText('Meetings Calendar')).toBeInTheDocument()
  })
})
