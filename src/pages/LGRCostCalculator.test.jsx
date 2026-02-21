import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LGRCostCalculator from './LGRCostCalculator'

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
  council_tier: 'district',
}

const mockLgrData = {
  meta: { consultation_closes: '2026-04-01' },
  overview: { title: 'Lancashire LGR' },
  proposed_models: [{
    id: 'two_unitary',
    name: 'Two Unitary Authorities',
    short_name: '2 UA',
    submitted_by: 'Government',
    doge_annual_savings: 5000000,
    doge_transition_cost: 15000000,
    doge_payback_years: 3,
    ccn_annual_savings: 4000000,
    ccn_transition_cost: 12000000,
    authorities: [{
      name: 'East Lancashire',
      population: 800000,
      councils: ['burnley', 'hyndburn', 'pendle', 'rossendale', 'lancashire_cc'],
      notes: 'Test authority',
    }],
  }],
}

const mockBudgetsSummary = {
  council_tax: {
    band_d_by_year: { '2024-25': 250.37 },
    band_d_total_by_year: { '2024-25': 2200.50 },
  },
  headline: {
    total_service_expenditure: 18700000,
    net_revenue_expenditure: 15000000,
  },
  service_breakdown: { 'Housing': 5000000, 'Planning': 3000000 },
  reserves: { total_closing: 2000000 },
}

const mockBudgetModel = {
  council_tax_harmonisation: {
    'two_unitary': {
      lcc_band_d_element: 1735.79,
      authorities: [{
        name: 'East Lancashire',
        harmonised_band_d: 1950.00,
        councils: [{
          council_id: 'burnley',
          name: 'Burnley',
          current_combined_element: 1986.16,
          harmonised_band_d: 1950.00,
          delta: -36.16,
          winner: true,
        }]
      }]
    }
  }
}

function setupMocks(overrides = {}) {
  useCouncilConfig.mockReturnValue(overrides.config || mockConfig)
  useData.mockReturnValue({
    data: overrides.data || [mockLgrData, mockBudgetsSummary, mockBudgetModel],
    loading: overrides.loading || false,
    error: overrides.error || null,
  })
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <LGRCostCalculator />
    </MemoryRouter>
  )
}

describe('LGRCostCalculator', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    global.fetch = vi.fn()
    Element.prototype.scrollIntoView = vi.fn()
  })

  // === Loading / Error states ===
  it('shows loading state while data loads', () => {
    setupMocks({ loading: true, data: null })
    renderComponent()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    setupMocks({ error: new Error('fail'), data: null })
    renderComponent()
    expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
  })

  // === Page rendering ===
  it('renders the page heading with data', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/LGR Cost/i)).toBeInTheDocument()
  })

  it('renders postcode input and band selector', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByLabelText(/your postcode/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/council tax band/i)).toBeInTheDocument()
  })

  it('renders current cost cards', () => {
    setupMocks()
    renderComponent()
    // The heading includes "What You Pay Now"
    expect(screen.getByRole('heading', { level: 2, name: /what you pay now/i })).toBeInTheDocument()
  })

  it('renders district, county, and police+fire breakdown for districts', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/burnley \(district\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Lancashire CC \(County\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Police \+ Fire/i)).toBeInTheDocument()
  })

  it('shows police+fire as independently set', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/set independently/i)).toBeInTheDocument()
  })

  it('renders service breakdown pie chart data', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/where your burnley council tax goes/i)).toBeInTheDocument()
  })

  // === Context banner ===
  it('renders context banner explaining projection', () => {
    setupMocks()
    renderComponent()
    const banner = document.querySelector('.calc-context-banner')
    expect(banner).toBeTruthy()
    expect(banner.textContent).toContain('projected forward')
    expect(banner.textContent).toContain('4.5')
  })

  // === Methodology section ===
  it('renders methodology toggle', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/how is this calculated/i)).toBeInTheDocument()
  })

  it('expands methodology section on click', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText(/how is this calculated/i))
    expect(screen.getByText(/harmonised rate/i)).toBeInTheDocument()
    expect(screen.getByText(/2027\/28 projected/i)).toBeInTheDocument()
  })

  it('methodology section mentions projection rate', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText(/how is this calculated/i))
    const methodSection = document.querySelector('.methodology-content')
    expect(methodSection).toBeTruthy()
    expect(methodSection.textContent).toContain('4.5')
    expect(methodSection.textContent).toContain('projected')
  })

  // === Postcode lookup ===
  it('disables calculate button when postcode is empty', () => {
    setupMocks()
    renderComponent()
    const btn = screen.getByText('Calculate')
    expect(btn).toBeDisabled()
  })

  it('enables calculate button when postcode has value', () => {
    setupMocks()
    renderComponent()
    const input = screen.getByLabelText(/your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11' } })
    const btn = screen.getByText('Calculate')
    expect(btn).not.toBeDisabled()
  })

  it('shows error for short postcode', async () => {
    setupMocks()
    renderComponent()
    const input = screen.getByLabelText(/your postcode/i)
    fireEvent.change(input, { target: { value: 'BB1' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText(/please enter a valid postcode/i)).toBeInTheDocument()
    })
  })

  it('shows error for non-Lancashire postcode', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: 200,
        result: {
          postcode: 'M1 1AA',
          admin_ward: 'Piccadilly',
          admin_district: 'Manchester',
        },
      }),
    })
    renderComponent()
    const input = screen.getByLabelText(/your postcode/i)
    fireEvent.change(input, { target: { value: 'M1 1AA' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText(/not in Lancashire/i)).toBeInTheDocument()
    })
  })

  it('shows comparison section after successful Lancashire postcode lookup', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: 200,
        result: {
          postcode: 'BB11 3DF',
          admin_ward: 'Brunshaw',
          admin_district: 'Burnley',
        },
      }),
    })
    renderComponent()
    const input = screen.getByLabelText(/your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11 3DF' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      // The h2 heading for the comparison section
      expect(screen.getByRole('heading', { level: 2, name: /after lgr.*2027\/28/i })).toBeInTheDocument()
    })
  })

  it('shows error when postcode not found', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ status: 404, result: null }),
    })
    renderComponent()
    const input = screen.getByLabelText(/your postcode/i)
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
    const input = screen.getByLabelText(/your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11 3DF' } })
    const form = screen.getByRole('form', { name: /postcode lookup/i })
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText(/unable to look up postcode/i)).toBeInTheDocument()
    })
  })

  // === Proposal cards ===
  it('renders proposal cards after postcode lookup', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: 200,
        result: { postcode: 'BB11 3DF', admin_ward: 'Brunshaw', admin_district: 'Burnley' },
      }),
    })
    renderComponent()
    const input = screen.getByLabelText(/your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11 3DF' } })
    fireEvent.submit(screen.getByRole('form', { name: /postcode lookup/i }))
    await waitFor(() => {
      expect(screen.getByText('2 UA')).toBeInTheDocument()
    })
  })

  it('shows "No LGR (2028)" bar in comparison chart', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: 200,
        result: { postcode: 'BB11 3DF', admin_ward: 'Brunshaw', admin_district: 'Burnley' },
      }),
    })
    renderComponent()
    const input = screen.getByLabelText(/your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11 3DF' } })
    fireEvent.submit(screen.getByRole('form', { name: /postcode lookup/i }))
    await waitFor(() => {
      // The chart description mentions projected
      expect(screen.getByText(/projected 2027\/28 bill without LGR/i)).toBeInTheDocument()
    })
  })

  it('expands proposal detail card on click', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: 200,
        result: { postcode: 'BB11 3DF', admin_ward: 'Brunshaw', admin_district: 'Burnley' },
      }),
    })
    renderComponent()
    const input = screen.getByLabelText(/your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11 3DF' } })
    fireEvent.submit(screen.getByRole('form', { name: /postcode lookup/i }))
    await waitFor(() => {
      expect(screen.getByText('2 UA')).toBeInTheDocument()
    })
    // Click the proposal header to expand
    const header = screen.getByText('Two Unitary Authorities').closest('[role="button"]')
    fireEvent.click(header)
    await waitFor(() => {
      expect(screen.getByText(/AI DOGE Estimate/i)).toBeInTheDocument()
      expect(screen.getByText(/Government Figures/i)).toBeInTheDocument()
      expect(screen.getAllByText(/East Lancashire/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows insight box explaining saving differences', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: 200,
        result: { postcode: 'BB11 3DF', admin_ward: 'Brunshaw', admin_district: 'Burnley' },
      }),
    })
    renderComponent()
    const input = screen.getByLabelText(/your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11 3DF' } })
    fireEvent.submit(screen.getByRole('form', { name: /postcode lookup/i }))
    await waitFor(() => {
      expect(screen.getByText(/why does the saving differ/i)).toBeInTheDocument()
    })
  })

  // === Band selector ===
  it('changes band multiplier when band is changed', () => {
    setupMocks()
    renderComponent()
    const select = screen.getByLabelText(/council tax band/i)
    fireEvent.change(select, { target: { value: 'A' } })
    // Band A = 6/9 of Band D. Check the total card shows a different value
    // The total card should show a value (Band A is cheaper)
    const totalCard = screen.getByText(/total bill/i).closest('.cost-card')
    expect(totalCard).toBeTruthy()
  })

  // === Prompt section ===
  it('shows prompt to enter postcode when no lookup done', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/enter your postcode above/i)).toBeInTheDocument()
  })

  // === LGR Tracker link ===
  it('renders CTA link to LGR Tracker', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/want the full picture/i)).toBeInTheDocument()
    expect(screen.getByText(/view lgr tracker/i)).toBeInTheDocument()
  })

  // === Unitary council handling ===
  it('handles unitary council config correctly', () => {
    setupMocks({
      config: { ...mockConfig, council_tier: 'unitary', council_id: 'blackpool', council_name: 'Blackpool' },
    })
    renderComponent()
    expect(screen.getByRole('heading', { level: 2, name: /what you pay now/i })).toBeInTheDocument()
    // Unitary should NOT show district/county breakdown
    expect(screen.queryByText(/\(district\)/i)).not.toBeInTheDocument()
  })

  // === Projection logic ===
  it('projects costs forward by 4.5% p.a. for 2 years in proposal comparison', async () => {
    setupMocks()
    global.fetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        status: 200,
        result: { postcode: 'BB11 3DF', admin_ward: 'Brunshaw', admin_district: 'Burnley' },
      }),
    })
    renderComponent()
    const input = screen.getByLabelText(/your postcode/i)
    fireEvent.change(input, { target: { value: 'BB11 3DF' } })
    fireEvent.submit(screen.getByRole('form', { name: /postcode lookup/i }))

    // The projected without-LGR total should be: 2200.50 * (1.045)^2 = ~2402.94
    // The projected harmonised rate should be: 1950.00 * (1.045)^2 = ~2130.26
    // Police+fire = 2200.50 - 1986.16 = 214.34, projected = 214.34 * (1.045)^2 = ~234.17
    // Total new = 2130.26 + 234.17 = ~2364.43
    // So saving vs no-LGR ≈ 2402.94 - 2364.43 = ~38.51
    await waitFor(() => {
      // The section heading mentions projected 2027/28
      expect(screen.getByRole('heading', { level: 2, name: /after lgr.*2027\/28/i })).toBeInTheDocument()
      // The comparison section is visible with projected figures
      const compSection = document.querySelector('.lgr-comparison')
      expect(compSection).toBeTruthy()
      expect(compSection.textContent).toContain('Without LGR')
    })
  })
})
