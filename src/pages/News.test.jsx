import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import News from './News'

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

const mockArticles = [
  {
    id: 'test-article',
    title: 'Test Article',
    summary: 'Test summary',
    date: '2025-02-01',
    category: 'spending',
  },
]

function renderComponent() {
  return render(
    <MemoryRouter>
      <News />
    </MemoryRouter>
  )
}

describe('News', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading articles/i)).toBeInTheDocument()
  })

  it('shows error state', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/failed to load articles/i)).toBeInTheDocument()
  })

  it('renders news page heading with data', () => {
    useData.mockReturnValue({
      data: mockArticles,
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText('News & Findings')).toBeInTheDocument()
  })
})
