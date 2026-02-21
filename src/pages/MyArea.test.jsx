import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MyArea from './MyArea'

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

const mockWards = {
  'ward-1': { name: 'Cliviger with Worsthorne', color: '#dc241f', parties: ['Labour'] },
  'ward-2': { name: 'Brunshaw', color: '#0087dc', parties: ['Conservative'] },
  'ward-3': { name: 'Daneshouse', color: '#dc241f', parties: ['Labour', 'Labour'] },
}

const mockCouncillors = [
  { id: 'c1', name: 'Alice Smith', ward: 'Cliviger with Worsthorne', party: 'Labour', party_color: '#dc241f', email: 'alice@burnley.gov.uk', phone: '01onal', roles: ['Executive Member'] },
  { id: 'c2', name: 'Bob Jones', ward: 'Brunshaw', party: 'Conservative', party_color: '#0087dc', email: 'bob@burnley.gov.uk' },
  { id: 'c3', name: 'Carol Lee', ward: 'Daneshouse', party: 'Labour', party_color: '#dc241f' },
  { id: 'c4', name: 'Dave Brown', ward: 'Daneshouse', party: 'Labour', party_color: '#dc241f' },
]

const mockDeprivation = {
  wards: {
    'Cliviger with Worsthorne': {
      deprivation_level: 'Low',
      avg_imd_score: 12.5,
      avg_imd_decile: 7,
      national_percentile: 65,
      lsoa_count: 4,
    },
    'Daneshouse': {
      deprivation_level: 'Very High',
      avg_imd_score: 55.2,
      avg_imd_decile: 1,
      national_percentile: 5,
      lsoa_count: 6,
    },
  },
}

function setupMocks(overrides = {}, deprivation = mockDeprivation) {
  useCouncilConfig.mockReturnValue(mockConfig)
  useData.mockImplementation((urls) => {
    if (Array.isArray(urls)) {
      // Primary data: wards + councillors
      return {
        data: overrides.data !== undefined ? overrides.data : [mockWards, mockCouncillors],
        loading: overrides.loading || false,
        error: overrides.error || null,
      }
    }
    // Optional deprivation data
    return { data: deprivation, loading: false, error: deprivation ? null : new Error('Not found') }
  })
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <MyArea />
    </MemoryRouter>
  )
}

describe('MyArea', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    global.fetch = vi.fn()
    // jsdom doesn't implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()
  })

  // === Loading / Error / Basic ===
  it('shows loading state while data loads', () => {
    useCouncilConfig.mockReturnValue(mockConfig)
    useData.mockImplementation((urls) => {
      if (Array.isArray(urls)) return { data: null, loading: true, error: null }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/loading ward data/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useCouncilConfig.mockReturnValue(mockConfig)
    useData.mockImplementation((urls) => {
      if (Array.isArray(urls)) return { data: null, loading: false, error: new Error('fail') }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
  })

  it('renders the page heading with data', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('My Area')).toBeInTheDocument()
  })

  it('renders postcode input', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByLabelText(/enter your postcode/i)).toBeInTheDocument()
  })

  // === Ward Grid ===
  it('renders all wards in the grid', () => {
    setupMocks()
    renderComponent()
    // Ward names appear in both dropdown options AND ward card grid
    expect(screen.getAllByText('Cliviger with Worsthorne').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Brunshaw').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Daneshouse').length).toBeGreaterThanOrEqual(1)
    // Verify ward cards specifically exist
    const wardCards = document.querySelectorAll('.ward-card')
    expect(wardCards.length).toBe(3)
  })

  it('renders ward cards sorted alphabetically', () => {
    setupMocks()
    renderComponent()
    const headings = screen.getAllByRole('button').filter(b => b.classList.contains('ward-card'))
    const names = headings.map(h => h.querySelector('h3')?.textContent)
    expect(names).toEqual(['Brunshaw', 'Cliviger with Worsthorne', 'Daneshouse'])
  })

  it('renders councillor names inside ward cards', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('Bob Jones')).toBeInTheDocument()
  })

  it('renders deprivation badges on ward cards', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Low deprivation')).toBeInTheDocument()
    expect(screen.getByText('Very High deprivation')).toBeInTheDocument()
  })

  it('renders party names on ward cards', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Conservative')).toBeInTheDocument()
  })

  // === Ward Selection ===
  it('selects a ward when clicking a ward card', () => {
    setupMocks()
    renderComponent()
    const wardCards = screen.getAllByRole('button').filter(b => b.classList.contains('ward-card'))
    fireEvent.click(wardCards[1])
    expect(screen.getByText('Your local councillors')).toBeInTheDocument()
  })

  it('selects ward via keyboard Enter', () => {
    setupMocks()
    renderComponent()
    const wardCards = screen.getAllByRole('button').filter(b => b.classList.contains('ward-card'))
    fireEvent.keyDown(wardCards[0], { key: 'Enter' })
    expect(screen.getByText('Your local councillors')).toBeInTheDocument()
  })

  it('selects ward via keyboard Space', () => {
    setupMocks()
    renderComponent()
    const wardCards = screen.getAllByRole('button').filter(b => b.classList.contains('ward-card'))
    fireEvent.keyDown(wardCards[0], { key: ' ' })
    expect(screen.getByText('Your local councillors')).toBeInTheDocument()
  })

  it('highlights selected ward card with aria-pressed', () => {
    setupMocks()
    renderComponent()
    const wardCards = screen.getAllByRole('button').filter(b => b.classList.contains('ward-card'))
    fireEvent.click(wardCards[0])
    expect(wardCards[0]).toHaveAttribute('aria-pressed', 'true')
  })

  // === Ward Dropdown ===
  it('renders ward dropdown selector', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByLabelText(/select your ward/i)).toBeInTheDocument()
  })

  it('selects ward from dropdown', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Brunshaw' } })
    expect(screen.getByText('Your local councillors')).toBeInTheDocument()
  })

  // === Ward Detail Panel ===
  it('shows councillor party badge when ward is selected', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Cliviger with Worsthorne' } })
    // 'Labour' appears in ward cards AND in the detail panel's party badge
    const labourElements = screen.getAllByText('Labour')
    expect(labourElements.length).toBeGreaterThanOrEqual(1)
    // Verify the party badge specifically exists in the detail panel
    const partyBadge = document.querySelector('.ward-details .party-badge')
    expect(partyBadge).toBeTruthy()
    expect(partyBadge.textContent).toBe('Labour')
  })

  it('shows councillor email as link when ward is selected', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Cliviger with Worsthorne' } })
    expect(screen.getByText('alice@burnley.gov.uk')).toBeInTheDocument()
  })

  it('shows councillor roles when ward is selected', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Cliviger with Worsthorne' } })
    expect(screen.getByText('Executive Member')).toBeInTheDocument()
  })

  it('shows deprivation data when ward with deprivation is selected', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Cliviger with Worsthorne' } })
    expect(screen.getByText('Deprivation Index')).toBeInTheDocument()
    expect(screen.getByText('12.5')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('65%')).toBeInTheDocument()
  })

  it('does not show deprivation panel when ward has no deprivation data', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Brunshaw' } })
    expect(screen.queryByText('Deprivation Index')).not.toBeInTheDocument()
  })

  it('shows multiple councillors for multi-member wards', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/select your ward/i)
    fireEvent.change(select, { target: { value: 'Daneshouse' } })
    // Names appear in ward card AND in the detail panel
    expect(screen.getAllByText('Carol Lee').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Dave Brown').length).toBeGreaterThanOrEqual(1)
    // Verify specifically that the detail panel has 2 councillor cards
    const detailCards = document.querySelectorAll('.ward-details .councillor-detail-card')
    expect(detailCards.length).toBe(2)
  })

  // === Postcode Lookup ===
  it('shows error for too-short postcode', async () => {
    setupMocks()
    renderComponent()
    const input = screen.getByLabelText(/enter your postcode/i)
    fireEvent.change(input, { target: { value: 'BB1' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText(/please enter a valid postcode/i)).toBeInTheDocument()
    })
  })

  it('shows success message when postcode found in correct district', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: 200,
        result: {
          postcode: 'BB11 3DF',
          admin_ward: 'Cliviger with Worsthorne',
          admin_district: 'Burnley',
        },
      }),
    })
    renderComponent()
    const input = screen.getByLabelText(/enter your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11 3DF' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      // Success message shows postcode and ward in .postcode-message
      const successMsg = document.querySelector('.postcode-message.success')
      expect(successMsg).toBeTruthy()
      expect(successMsg.textContent).toContain('BB11 3DF')
      expect(successMsg.textContent).toContain('Cliviger with Worsthorne')
    })
  })

  it('shows error when postcode is in different district', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: 200,
        result: {
          postcode: 'PR1 1AA',
          admin_ward: 'City Centre',
          admin_district: 'Preston',
        },
      }),
    })
    renderComponent()
    const input = screen.getByLabelText(/enter your postcode/i)
    fireEvent.change(input, { target: { value: 'PR1 1AA' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText(/that postcode is in Preston, not Burnley/i)).toBeInTheDocument()
    })
  })

  it('shows error when postcode not found', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ status: 404, result: null }),
    })
    renderComponent()
    const input = screen.getByLabelText(/enter your postcode/i)
    fireEvent.change(input, { target: { value: 'ZZ99 9ZZ' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText(/postcode not found/i)).toBeInTheDocument()
    })
  })

  it('shows error when fetch fails', async () => {
    setupMocks()
    global.fetch.mockRejectedValueOnce(new Error('Network error'))
    renderComponent()
    const input = screen.getByLabelText(/enter your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11 3DF' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText(/unable to look up postcode/i)).toBeInTheDocument()
    })
  })

  it('shows noData message when ward not in dataset', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: 200,
        result: {
          postcode: 'BB11 9XX',
          admin_ward: 'Unknown Ward',
          admin_district: 'Burnley',
        },
      }),
    })
    renderComponent()
    const input = screen.getByLabelText(/enter your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11 9XX' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText(/Unknown Ward/)).toBeInTheDocument()
      expect(screen.getByText(/don't have detailed councillor data/i)).toBeInTheDocument()
    })
  })

  it('disables lookup button when input is empty', () => {
    setupMocks()
    renderComponent()
    const btn = screen.getByText('Look up')
    expect(btn).toBeDisabled()
  })

  it('enables lookup button when input has value', () => {
    setupMocks()
    renderComponent()
    const input = screen.getByLabelText(/enter your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11' } })
    const btn = screen.getByText('Look up')
    expect(btn).not.toBeDisabled()
  })

  // === Empty wards ===
  it('renders without crashing when wards is empty', () => {
    setupMocks({ data: [{}, []] }, null)
    renderComponent()
    expect(screen.getByText('My Area')).toBeInTheDocument()
    expect(screen.getByText('All Wards')).toBeInTheDocument()
  })

  // === Official link ===
  it('renders official council link', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('More Information')).toBeInTheDocument()
    expect(screen.getByText(/burnley.gov.uk/)).toBeInTheDocument()
  })
})
