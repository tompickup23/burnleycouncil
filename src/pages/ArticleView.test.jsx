import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ArticleView from './ArticleView'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(),
  }
})

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useParams } from 'react-router-dom'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
}

const mockIndex = [
  { id: 'test-article', title: 'Test Article', summary: 'Test summary', date: '2025-02-01', category: 'News' },
]

function renderComponent() {
  return render(
    <MemoryRouter initialEntries={['/news/test-article']}>
      <ArticleView />
    </MemoryRouter>
  )
}

describe('ArticleView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
    useParams.mockReturnValue({ articleId: 'test-article' })
    // Mock fetch for article content loading — resolves quickly so contentLoading becomes false
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ content: '<p>Article body</p>' }),
    }))
  })

  it('shows loading state while index data loads', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading article/i)).toBeInTheDocument()
  })

  it('shows error state when index fails to load', async () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    // Wait for contentLoading to resolve (fetch completes) so the error branch is reached
    await waitFor(() => {
      expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
    })
  })

  it('renders article title with data', async () => {
    useData.mockReturnValue({ data: mockIndex, loading: false, error: null })
    renderComponent()
    // Wait for contentLoading to resolve so the article renders
    await waitFor(() => {
      expect(screen.getByText('Test Article')).toBeInTheDocument()
    })
  })
})
