import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

const mockCouncillors = [
  { id: 1, name: 'Alice Smith', party: 'Labour', ward: 'Cliviger', party_color: '#dc241f', email: 'alice@burnley.gov.uk', phone: '01onal', roles: ['Executive Member'] },
  { id: 2, name: 'Bob Jones', party: 'Conservative', ward: 'Brunshaw', party_color: '#0087dc', email: 'bob@burnley.gov.uk' },
  { id: 3, name: 'Carol Lee', party: 'Labour', ward: 'Daneshouse', party_color: '#dc241f' },
  { id: 4, name: 'Dave Brown', party: 'Green Party', ward: 'Gannow', party_color: '#6ab023' },
]

const mockSummary = {
  total_wards: 15,
  total_councillors: 4,
  by_party: [
    { party: 'Labour', count: 2, color: '#dc241f' },
    { party: 'Conservative', count: 1, color: '#0087dc' },
    { party: 'Green Party', count: 1, color: '#6ab023' },
  ],
  coalition: {
    type: 'majority',
    parties: ['Labour'],
    total_seats: 2,
  },
  opposition_seats: 2,
  majority_threshold: 3,
  council_leader: 'Alice Smith',
  deputy_leaders: ['Carol Lee'],
  mayor: 'Bob Jones',
  deputy_mayor: 'Eve Wilson',
  opposition_leader: 'Dave Brown',
}

const mockData = [mockCouncillors, mockSummary, {}]

function setupMocks(overrides = {}) {
  useCouncilConfig.mockReturnValue(mockConfig)
  useData.mockReturnValue({
    data: mockData,
    loading: false,
    error: null,
    ...overrides,
  })
}

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

  // === Loading / Error / Basic ===
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
    setupMocks()
    renderComponent()
    expect(screen.getByText('Council Politics')).toBeInTheDocument()
  })

  it('renders councillor name from data', () => {
    setupMocks()
    renderComponent()
    // Alice Smith appears in both Key Figures (as council leader) and councillor cards
    const aliceElements = screen.getAllByText('Alice Smith')
    expect(aliceElements.length).toBeGreaterThanOrEqual(1)
  })

  // === Council Composition ===
  it('renders council composition section when coalition data exists', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Council Composition')).toBeInTheDocument()
  })

  it('renders ruling party label for majority coalition', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Ruling Party')).toBeInTheDocument()
  })

  it('renders coalition seat count', () => {
    setupMocks()
    renderComponent()
    // 2 seats in coalition
    const seatElements = screen.getAllByText('2')
    expect(seatElements.length).toBeGreaterThan(0)
  })

  it('renders opposition section', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Opposition')).toBeInTheDocument()
  })

  it('renders majority threshold', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/majority threshold: 3 seats/i)).toBeInTheDocument()
  })

  it('does not render composition section when no coalition data', () => {
    const noCoalitionSummary = { ...mockSummary, coalition: null }
    useData.mockReturnValue({
      data: [mockCouncillors, noCoalitionSummary, {}],
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.queryByText('Council Composition')).not.toBeInTheDocument()
  })

  // === Seat Diagram ===
  it('renders seat diagram section', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Seat Diagram')).toBeInTheDocument()
  })

  it('renders party labels with seat counts in diagram', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Labour (2)')).toBeInTheDocument()
    expect(screen.getByText('Conservative (1)')).toBeInTheDocument()
    expect(screen.getByText('Green Party (1)')).toBeInTheDocument()
  })

  // === Key Figures ===
  it('renders key figures section', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Key Figures')).toBeInTheDocument()
  })

  it('renders council leader', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Leader of the Council')).toBeInTheDocument()
  })

  it('renders deputy leader', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Deputy Leader')).toBeInTheDocument()
    // Carol Lee appears in both Key Figures (as deputy leader) and councillor cards
    const carolElements = screen.getAllByText('Carol Lee')
    expect(carolElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renders mayor', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Mayor')).toBeInTheDocument()
  })

  it('renders deputy mayor', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Deputy Mayor')).toBeInTheDocument()
    expect(screen.getByText('Eve Wilson')).toBeInTheDocument()
  })

  it('renders opposition leader', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Opposition Leader')).toBeInTheDocument()
  })

  // === Search ===
  it('renders search input', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByRole('textbox', { name: /search councillors/i })).toBeInTheDocument()
  })

  it('filters councillors by name', () => {
    setupMocks()
    renderComponent()
    const input = screen.getByRole('textbox', { name: /search councillors/i })
    fireEvent.change(input, { target: { value: 'Alice' } })
    // Alice Smith still visible (in key figures + filtered card)
    const aliceElements = screen.getAllByText('Alice Smith')
    expect(aliceElements.length).toBeGreaterThanOrEqual(1)
    // Bob Jones only appears in councillor cards, which should be filtered out
    // But Bob Jones is mayor, so appears in Key Figures too
    const cards = document.querySelectorAll('.councillors-grid .councillor-card')
    expect(cards.length).toBe(1) // Only Alice's card should show
  })

  it('filters councillors by ward', () => {
    setupMocks()
    renderComponent()
    const input = screen.getByRole('textbox', { name: /search councillors/i })
    fireEvent.change(input, { target: { value: 'Brunshaw' } })
    // Bob Jones should have a councillor card visible
    const cards = document.querySelectorAll('.councillors-grid .councillor-card')
    expect(cards.length).toBe(1) // Only Bob's card
    // Alice Smith still appears in Key Figures section (as leader)
    // so we can't check queryByText('Alice Smith') not in document
  })

  it('shows no results message when search matches nothing', () => {
    setupMocks()
    renderComponent()
    const input = screen.getByRole('textbox', { name: /search councillors/i })
    fireEvent.change(input, { target: { value: 'ZZZZZZ' } })
    expect(screen.getByText(/no councillors found/i)).toBeInTheDocument()
  })

  // === Party Filter ===
  it('renders party filter dropdown', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByRole('combobox', { name: /filter by political party/i })).toBeInTheDocument()
  })

  it('filters by party when selected', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByRole('combobox', { name: /filter by political party/i })
    fireEvent.change(select, { target: { value: 'Green Party' } })
    // Dave Brown appears in Key Figures (opposition leader) AND councillor cards
    const cards = document.querySelectorAll('.councillors-grid .councillor-card')
    expect(cards.length).toBe(1)
    expect(screen.getAllByText('Dave Brown').length).toBeGreaterThanOrEqual(1)
  })

  // === Councillor Cards ===
  it('renders all councillor cards', () => {
    setupMocks()
    renderComponent()
    const cards = document.querySelectorAll('.councillors-grid .councillor-card')
    expect(cards.length).toBe(4)
    // Names appear in Key Figures AND councillor cards, so use getAllByText for all
    expect(screen.getAllByText('Alice Smith').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Bob Jones').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Carol Lee').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Dave Brown').length).toBeGreaterThanOrEqual(1)
  })

  it('renders ward names on councillor cards', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Cliviger')).toBeInTheDocument()
    expect(screen.getByText('Brunshaw')).toBeInTheDocument()
  })

  it('renders councillor roles', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Executive Member')).toBeInTheDocument()
  })

  it('expands councillor card on click to show contact details', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('councillor-card'))
    fireEvent.click(cards[0]) // Alice Smith
    expect(screen.getByText('alice@burnley.gov.uk')).toBeInTheDocument()
  })

  it('collapses councillor card when clicking again', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('councillor-card'))
    fireEvent.click(cards[0]) // Expand
    expect(screen.getByText('alice@burnley.gov.uk')).toBeInTheDocument()
    fireEvent.click(cards[0]) // Collapse
    expect(screen.queryByText('alice@burnley.gov.uk')).not.toBeInTheDocument()
  })

  it('expands councillor card via keyboard Enter', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('councillor-card'))
    fireEvent.keyDown(cards[0], { key: 'Enter' })
    expect(screen.getByText('alice@burnley.gov.uk')).toBeInTheDocument()
  })

  it('sets aria-expanded on councillor card', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('councillor-card'))
    expect(cards[0]).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(cards[0])
    expect(cards[0]).toHaveAttribute('aria-expanded', 'true')
  })

  // === Subtitle ===
  it('renders subtitle with councillor count and ward count', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/4 councillors representing 15 wards/i)).toBeInTheDocument()
  })
})
