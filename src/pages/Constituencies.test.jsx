import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Constituencies from './Constituencies'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../components/ui', () => ({
  LoadingState: ({ message }) => <div>{message || 'Loading...'}</div>,
}))

import { useData } from '../hooks/useData'

const mockConstituenciesData = {
  meta: { generated: '2026-02-19' },
  constituencies: [
    {
      id: 'burnley',
      name: 'Burnley',
      mp: {
        name: 'Oliver Ryan',
        party: 'Labour (Co-op)',
        majority_pct: 0.187,
        photo_url: 'https://example.com/photo.jpg',
        expenses: { total_cost_to_taxpayer: 289889 },
      },
      voting_record: { attendance_pct: 0.871 },
      overlapping_councils: ['burnley'],
      partial: false,
    },
    {
      id: 'fylde',
      name: 'Fylde',
      mp: {
        name: 'Andrew Snowden',
        party: 'Conservative',
        majority_pct: 0.032,
      },
      voting_record: { attendance_pct: 0.65 },
      overlapping_councils: ['fylde'],
      partial: false,
    },
    {
      id: 'southport',
      name: 'Southport',
      mp: {
        name: 'Patrick Hurley',
        party: 'Labour',
        majority_pct: 0.05,
      },
      voting_record: { attendance_pct: 0.80 },
      overlapping_councils: ['west_lancashire'],
      partial: true,
    },
  ],
}

const mockPollingData = {
  swing_from_ge2024: {
    Labour: -0.02,
    Conservative: 0.01,
  },
}

function mockUseDataLoaded(path) {
  if (path === '/data/shared/constituencies.json') {
    return { data: mockConstituenciesData, loading: false, error: null }
  }
  if (path === '/data/shared/polling.json') {
    return { data: mockPollingData, loading: false, error: null }
  }
  return { data: null, loading: false, error: null }
}

function mockUseDataLoading(path) {
  if (path === '/data/shared/constituencies.json') {
    return { data: null, loading: true, error: null }
  }
  return { data: null, loading: false, error: null }
}

function mockUseDataError(path) {
  if (path === '/data/shared/constituencies.json') {
    return { data: null, loading: false, error: new Error('Network error') }
  }
  return { data: null, loading: false, error: null }
}

function mockUseDataEmpty(path) {
  if (path === '/data/shared/constituencies.json') {
    return { data: { meta: {}, constituencies: [] }, loading: false, error: null }
  }
  return { data: null, loading: false, error: null }
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Constituencies />
    </MemoryRouter>
  )
}

describe('Constituencies', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading state while data loads', () => {
    useData.mockImplementation(mockUseDataLoading)
    renderComponent()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders error state when data fails to load', () => {
    useData.mockImplementation(mockUseDataError)
    renderComponent()
    expect(screen.getByText('Constituency data unavailable')).toBeInTheDocument()
    expect(screen.getByText(/unable to load constituency data/i)).toBeInTheDocument()
  })

  it('shows error state when constituencies is missing from data', () => {
    useData.mockImplementation((path) => {
      if (path === '/data/shared/constituencies.json') {
        return { data: { meta: {} }, loading: false, error: null }
      }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText('Constituency data unavailable')).toBeInTheDocument()
  })

  it('renders constituency cards with correct data', () => {
    useData.mockImplementation(mockUseDataLoaded)
    renderComponent()
    expect(screen.getByText('Burnley')).toBeInTheDocument()
    expect(screen.getByText('Oliver Ryan')).toBeInTheDocument()
    expect(screen.getByText('Fylde')).toBeInTheDocument()
    expect(screen.getByText('Andrew Snowden')).toBeInTheDocument()
    expect(screen.getByText('Southport')).toBeInTheDocument()
    expect(screen.getByText('Patrick Hurley')).toBeInTheDocument()
  })

  it('renders page header with total count', () => {
    useData.mockImplementation(mockUseDataLoaded)
    renderComponent()
    expect(screen.getByText('Lancashire MPs')).toBeInTheDocument()
    expect(screen.getByText(/3 Westminster constituencies/)).toBeInTheDocument()
  })

  it('search filters by constituency name', () => {
    useData.mockImplementation(mockUseDataLoaded)
    renderComponent()
    const searchInput = screen.getByPlaceholderText(/search constituency or mp/i)
    fireEvent.change(searchInput, { target: { value: 'Burnley' } })
    expect(screen.getByText('Oliver Ryan')).toBeInTheDocument()
    expect(screen.queryByText('Andrew Snowden')).not.toBeInTheDocument()
    expect(screen.queryByText('Patrick Hurley')).not.toBeInTheDocument()
  })

  it('search filters by MP name', () => {
    useData.mockImplementation(mockUseDataLoaded)
    renderComponent()
    const searchInput = screen.getByPlaceholderText(/search constituency or mp/i)
    fireEvent.change(searchInput, { target: { value: 'Snowden' } })
    expect(screen.getByText('Andrew Snowden')).toBeInTheDocument()
    expect(screen.queryByText('Oliver Ryan')).not.toBeInTheDocument()
  })

  it('party filter narrows results', () => {
    useData.mockImplementation(mockUseDataLoaded)
    renderComponent()
    const selects = screen.getAllByRole('combobox')
    // First select is party filter, second is sort
    const partySelect = selects[0]
    fireEvent.change(partySelect, { target: { value: 'Conservative' } })
    expect(screen.getByText('Andrew Snowden')).toBeInTheDocument()
    expect(screen.queryByText('Oliver Ryan')).not.toBeInTheDocument()
    expect(screen.queryByText('Patrick Hurley')).not.toBeInTheDocument()
  })

  it('sort by A-Z orders alphabetically', () => {
    useData.mockImplementation(mockUseDataLoaded)
    renderComponent()
    const cards = screen.getAllByRole('link')
    const names = cards.map(c => c.querySelector('.constituency-card-name')?.textContent).filter(Boolean)
    expect(names).toEqual(['Burnley', 'Fylde', 'Southport'])
  })

  it('sort by majority orders by highest majority first', () => {
    useData.mockImplementation(mockUseDataLoaded)
    renderComponent()
    const selects = screen.getAllByRole('combobox')
    const sortSelect = selects[1]
    fireEvent.change(sortSelect, { target: { value: 'majority' } })
    const cards = screen.getAllByRole('link')
    const names = cards.map(c => c.querySelector('.constituency-card-name')?.textContent).filter(Boolean)
    // Burnley 18.7% > Southport 5.0% > Fylde 3.2%
    expect(names).toEqual(['Burnley', 'Southport', 'Fylde'])
  })

  it('sort by most vulnerable orders by lowest majority first', () => {
    useData.mockImplementation(mockUseDataLoaded)
    renderComponent()
    const selects = screen.getAllByRole('combobox')
    const sortSelect = selects[1]
    fireEvent.change(sortSelect, { target: { value: 'majority_asc' } })
    const cards = screen.getAllByRole('link')
    const names = cards.map(c => c.querySelector('.constituency-card-name')?.textContent).filter(Boolean)
    // Fylde 3.2% < Southport 5.0% < Burnley 18.7%
    expect(names).toEqual(['Fylde', 'Southport', 'Burnley'])
  })

  it('renders party breakdown chips', () => {
    useData.mockImplementation(mockUseDataLoaded)
    renderComponent()
    expect(screen.getByText(/Labour \(Co-op\): 1/)).toBeInTheDocument()
    expect(screen.getByText(/Conservative: 1/)).toBeInTheDocument()
    expect(screen.getByText(/Labour: 1/)).toBeInTheDocument()
  })

  it('renders footer with data source info', () => {
    useData.mockImplementation(mockUseDataLoaded)
    renderComponent()
    expect(screen.getByText(/Parliament Members API/)).toBeInTheDocument()
    expect(screen.getByText(/Boundary revision: 2024/)).toBeInTheDocument()
    expect(screen.getByText(/Updated 2026-02-19/)).toBeInTheDocument()
  })

  it('cards link to /constituency/:id', () => {
    useData.mockImplementation(mockUseDataLoaded)
    renderComponent()
    const links = screen.getAllByRole('link')
    const hrefs = links.map(l => l.getAttribute('href'))
    expect(hrefs).toContain('/constituency/burnley')
    expect(hrefs).toContain('/constituency/fylde')
    expect(hrefs).toContain('/constituency/southport')
  })

  it('shows cross-border badge for partial constituencies', () => {
    useData.mockImplementation(mockUseDataLoaded)
    renderComponent()
    const badges = screen.getAllByText('Cross-border')
    // Only Southport is partial
    expect(badges).toHaveLength(1)
  })

  it('shows empty message when filters match nothing', () => {
    useData.mockImplementation(mockUseDataLoaded)
    renderComponent()
    const searchInput = screen.getByPlaceholderText(/search constituency or mp/i)
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } })
    expect(screen.getByText('No constituencies match your filters.')).toBeInTheDocument()
  })
})
