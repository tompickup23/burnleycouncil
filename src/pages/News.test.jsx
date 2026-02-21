import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

// Generate enough articles for pagination (13 articles, 12 per page)
const mockArticles = [
  { id: 'art-1', title: 'Duplicate Payments Found', summary: 'Investigation reveals spending issues.', date: '2025-02-01', category: 'spending' },
  { id: 'art-2', title: 'Council Tax Rising', summary: 'Band D rate increases again.', date: '2025-01-15', category: 'spending' },
  { id: 'art-3', title: 'Election Analysis', summary: 'Ward-level breakdown of democracy outcomes.', date: '2025-01-10', category: 'Democracy' },
  { id: 'art-4', title: 'CEO Pay Report', summary: 'Executive pay analysis across Lancashire.', date: '2025-01-05', category: 'Analysis' },
  { id: 'art-5', title: 'Waste Contract Deep Dive', summary: 'Exclusive: FCC contract details.', date: '2024-12-20', category: 'spending' },
  { id: 'art-6', title: 'Budget Preview', summary: 'What to expect in the 2026 budget.', date: '2024-12-15', category: 'spending' },
  { id: 'art-7', title: 'Planning Decisions', summary: 'Controversial planning approvals.', date: '2024-12-10', category: 'Democracy' },
  { id: 'art-8', title: 'Procurement Issues', summary: 'Single-tender contracts examined.', date: '2024-12-05', category: 'spending' },
  { id: 'art-9', title: 'LGR Update', summary: 'Local government reorganisation progress.', date: '2024-11-30', category: 'Analysis' },
  { id: 'art-10', title: 'Councillor Expenses', summary: 'Allowance and expense claims.', date: '2024-11-25', category: 'spending' },
  { id: 'art-11', title: 'Supplier Analysis', summary: 'Concentration of spending with few suppliers.', date: '2024-11-20', category: 'spending' },
  { id: 'art-12', title: 'IT Spending Report', summary: 'Digital transformation costs examined.', date: '2024-11-15', category: 'spending' },
  { id: 'art-13', title: 'Page Two Article', summary: 'This should be on page two.', date: '2024-11-10', category: 'Analysis' },
]

function setupMocks(overrides = {}) {
  useCouncilConfig.mockReturnValue(mockConfig)
  useData.mockReturnValue({
    data: mockArticles,
    loading: false,
    error: null,
    ...overrides,
  })
}

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

  // === Loading / Error ===
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
    setupMocks()
    renderComponent()
    expect(screen.getByText('News & Findings')).toBeInTheDocument()
  })

  // === Article List ===
  it('renders article titles', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Duplicate Payments Found')).toBeInTheDocument()
    expect(screen.getByText('Council Tax Rising')).toBeInTheDocument()
  })

  it('renders article summaries', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/investigation reveals spending issues/i)).toBeInTheDocument()
  })

  it('renders article category badges', () => {
    setupMocks()
    renderComponent()
    const spendingBadges = screen.getAllByText('spending')
    expect(spendingBadges.length).toBeGreaterThan(0)
  })

  it('renders results count', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/13 articles/)).toBeInTheDocument()
  })

  // === Category Filter ===
  it('renders category filter buttons', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('All')).toBeInTheDocument()
  })

  it('filters articles by category', () => {
    setupMocks()
    renderComponent()
    const democracyBtn = screen.getByRole('button', { name: 'Democracy' })
    fireEvent.click(democracyBtn)
    expect(screen.getByText('Election Analysis')).toBeInTheDocument()
    expect(screen.getByText('Planning Decisions')).toBeInTheDocument()
    expect(screen.queryByText('Duplicate Payments Found')).not.toBeInTheDocument()
  })

  it('updates results count when category filtered', () => {
    setupMocks()
    renderComponent()
    const democracyBtn = screen.getByRole('button', { name: 'Democracy' })
    fireEvent.click(democracyBtn)
    expect(screen.getByText(/2 articles/)).toBeInTheDocument()
    expect(screen.getByText(/in Democracy/)).toBeInTheDocument()
  })

  it('shows all articles when All is clicked', () => {
    setupMocks()
    renderComponent()
    const democracyBtn = screen.getByRole('button', { name: 'Democracy' })
    fireEvent.click(democracyBtn)
    const allBtn = screen.getByRole('button', { name: 'All' })
    fireEvent.click(allBtn)
    expect(screen.getByText(/13 articles/)).toBeInTheDocument()
  })

  // === Search ===
  it('renders search input', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByRole('textbox', { name: /search articles/i })).toBeInTheDocument()
  })

  it('filters articles by search query in title', () => {
    setupMocks()
    renderComponent()
    const input = screen.getByRole('textbox', { name: /search articles/i })
    fireEvent.change(input, { target: { value: 'Duplicate' } })
    expect(screen.getByText('Duplicate Payments Found')).toBeInTheDocument()
    expect(screen.queryByText('Council Tax Rising')).not.toBeInTheDocument()
  })

  it('filters articles by search query in summary', () => {
    setupMocks()
    renderComponent()
    const input = screen.getByRole('textbox', { name: /search articles/i })
    fireEvent.change(input, { target: { value: 'FCC contract' } })
    expect(screen.getByText('Waste Contract Deep Dive')).toBeInTheDocument()
  })

  it('shows results count with search query', () => {
    setupMocks()
    renderComponent()
    const input = screen.getByRole('textbox', { name: /search articles/i })
    fireEvent.change(input, { target: { value: 'Duplicate' } })
    expect(screen.getByText(/1 article/)).toBeInTheDocument()
    expect(screen.getByText(/matching "Duplicate"/)).toBeInTheDocument()
  })

  it('shows empty results message when nothing matches search', () => {
    setupMocks()
    renderComponent()
    const input = screen.getByRole('textbox', { name: /search articles/i })
    fireEvent.change(input, { target: { value: 'ZZZZZZZZ' } })
    expect(screen.getByText(/no articles found/i)).toBeInTheDocument()
  })

  it('shows clear button when search has value', () => {
    setupMocks()
    renderComponent()
    const input = screen.getByRole('textbox', { name: /search articles/i })
    fireEvent.change(input, { target: { value: 'test' } })
    expect(screen.getByRole('button', { name: /clear search/i })).toBeInTheDocument()
  })

  it('clears search when clear button is clicked', () => {
    setupMocks()
    renderComponent()
    const input = screen.getByRole('textbox', { name: /search articles/i })
    fireEvent.change(input, { target: { value: 'Duplicate' } })
    const clearBtn = screen.getByRole('button', { name: /clear search/i })
    fireEvent.click(clearBtn)
    expect(screen.getByText(/13 articles/)).toBeInTheDocument()
  })

  // === Pagination ===
  it('renders pagination when articles exceed page size', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument()
  })

  it('shows 12 articles on first page', () => {
    setupMocks()
    renderComponent()
    // First 12 articles should be visible, 13th should not
    expect(screen.getByText('Duplicate Payments Found')).toBeInTheDocument()
    expect(screen.getByText('IT Spending Report')).toBeInTheDocument()
    expect(screen.queryByText('Page Two Article')).not.toBeInTheDocument()
  })

  it('navigates to next page', () => {
    setupMocks()
    renderComponent()
    const nextBtn = screen.getByRole('button', { name: /next page/i })
    fireEvent.click(nextBtn)
    expect(screen.getByText('Page Two Article')).toBeInTheDocument()
    expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument()
  })

  it('disables prev button on first page', () => {
    setupMocks()
    renderComponent()
    const prevBtn = screen.getByRole('button', { name: /previous page/i })
    expect(prevBtn).toBeDisabled()
  })

  it('disables next button on last page', () => {
    setupMocks()
    renderComponent()
    const nextBtn = screen.getByRole('button', { name: /next page/i })
    fireEvent.click(nextBtn) // Go to page 2
    expect(nextBtn).toBeDisabled()
  })

  // === Dual data format ===
  it('handles {articles: [...]} wrapper format', () => {
    useData.mockReturnValue({
      data: { articles: mockArticles.slice(0, 3) },
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText('Duplicate Payments Found')).toBeInTheDocument()
    expect(screen.getByText('Election Analysis')).toBeInTheDocument()
  })

  // === Featured article ===
  it('applies featured class to first article on page 1', () => {
    setupMocks()
    renderComponent()
    const links = document.querySelectorAll('.article-card')
    expect(links[0].classList.contains('featured')).toBe(true)
  })

  // === No pagination when few articles ===
  it('does not render pagination when articles fit one page', () => {
    useData.mockReturnValue({
      data: mockArticles.slice(0, 5),
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.queryByText(/page \d+ of \d+/i)).not.toBeInTheDocument()
  })
})
