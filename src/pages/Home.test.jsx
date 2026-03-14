import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from './Home'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('../hooks/useCountUp', () => ({
  useCountUp: (target, opts = {}) => {
    const formatter = opts.formatter || Math.round
    return formatter(target)
  },
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
  spending_data_period: 'April 2021 – present',
  hero_subtitle: null,
  data_sources: {
    doge_investigation: true,
    politics: true,
    news: true,
    budget_trends: true,
  },
}

const mockInsights = {
  summary: {
    total_spend: 150000000,
    transaction_count: 25000,
    unique_suppliers: 3000,
    date_range: { min: '2021-04-01', max: '2025-12-31' },
  },
  supplier_analysis: {
    top_20_suppliers: [
      { supplier: 'ACME Corp Ltd', total: 5000000, transactions: 100 },
      { supplier: 'Widget Services', total: 3000000, transactions: 50 },
    ],
    concentration_ratio: 0.45,
  },
  yoy_analysis: {
    spend_by_year: { '2022': 30000000, '2023': 35000000, '2024': 40000000 },
  },
}

function setupMocks(config = mockConfig) {
  useCouncilConfig.mockReturnValue(config)
  useData.mockImplementation((urls) => {
    if (Array.isArray(urls)) {
      // Primary data array
      return {
        data: [mockInsights, { findings: [], key_findings: [] }, { by_party: [] }, [], null],
        loading: false,
        error: null,
      }
    }
    // Individual useData calls for map data — return null so maps don't render in JSDOM
    return { data: null, loading: false, error: null }
  })
}

function renderComponent(config = mockConfig) {
  useCouncilConfig.mockReturnValue(config)
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  )
}

describe('Home', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state while data loads', () => {
    useData.mockImplementation((urls) => {
      if (Array.isArray(urls)) return { data: null, loading: true, error: null }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/loading dashboard data/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useData.mockImplementation((urls) => {
      if (Array.isArray(urls)) return { data: null, loading: false, error: new Error('network error') }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
  })

  it('renders hero section with council data', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/Here's Where It Went/i)).toBeInTheDocument()
    expect(screen.getAllByText(/automated analysis/i).length).toBeGreaterThan(0)
  })

  it('renders disclaimer banner', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/independent transparency tool/i)).toBeInTheDocument()
  })

  it('shows formatted total spend', () => {
    setupMocks()
    renderComponent()
    // £150M should appear in multiple places (hero h1 + impact card)
    expect(screen.getAllByText(/£150/).length).toBeGreaterThan(0)
  })

  it('renders with minimal config (no optional data sources)', () => {
    const minimalConfig = {
      ...mockConfig,
      data_sources: {},
    }
    useData.mockImplementation((urls) => {
      if (Array.isArray(urls)) return { data: [mockInsights], loading: false, error: null }
      return { data: null, loading: false, error: null }
    })
    renderComponent(minimalConfig)
    expect(screen.getAllByText(/your money/i).length).toBeGreaterThan(0)
  })

  it('does not crash when map data is null (JSDOM)', () => {
    setupMocks()
    renderComponent()
    // Maps should not render since map data is null
    expect(screen.queryByTestId('lancashire-map')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ward-map')).not.toBeInTheDocument()
  })

  it('renders fiscal resilience banner when demographic_fiscal data is available', () => {
    useCouncilConfig.mockReturnValue(mockConfig)
    useData.mockImplementation((urls) => {
      if (Array.isArray(urls)) {
        return {
          data: [mockInsights, { findings: [], key_findings: [] }, { by_party: [] }, [], null],
          loading: false,
          error: null,
        }
      }
      if (urls === '/data/demographic_fiscal.json') {
        return {
          data: { fiscal_resilience_score: 20, threats: [{ type: 'fiscal' }, { type: 'demographic' }] },
          loading: false,
          error: null,
        }
      }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/Fiscal Resilience/)).toBeInTheDocument()
    expect(screen.getByText(/20\/100/)).toBeInTheDocument()
    expect(screen.getByText(/2 demographic fiscal pressures/)).toBeInTheDocument()
  })

  it('does not render fiscal banner when demographic_fiscal data is null', () => {
    setupMocks()
    renderComponent()
    expect(screen.queryByText(/Fiscal Resilience/)).not.toBeInTheDocument()
  })

  it('shows reserves adequacy in fiscal banner when reserves and expenditure provided', () => {
    useCouncilConfig.mockReturnValue(mockConfig)
    useData.mockImplementation((urls) => {
      if (Array.isArray(urls)) {
        return {
          data: [mockInsights, { findings: [], key_findings: [] }, { by_party: [] }, [], null],
          loading: false,
          error: null,
        }
      }
      if (urls === '/data/demographic_fiscal.json') {
        return {
          data: { fiscal_resilience_score: 45, threats: [{ type: 'fiscal' }], reserves: 5000000, expenditure: 10000000 },
          loading: false,
          error: null,
        }
      }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/Fiscal Resilience/)).toBeInTheDocument()
    expect(screen.getByText(/months cover/)).toBeInTheDocument()
  })

  it('fiscal banner links to /budgets instead of /doge', () => {
    useCouncilConfig.mockReturnValue(mockConfig)
    useData.mockImplementation((urls) => {
      if (Array.isArray(urls)) {
        return {
          data: [mockInsights, { findings: [], key_findings: [] }, { by_party: [] }, [], null],
          loading: false,
          error: null,
        }
      }
      if (urls === '/data/demographic_fiscal.json') {
        return {
          data: { fiscal_resilience_score: 20, threats: [] },
          loading: false,
          error: null,
        }
      }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    const banner = screen.getByText(/Fiscal Resilience/).closest('a')
    expect(banner.getAttribute('href')).toBe('/budgets')
  })

  it('fiscal banner shows without reserves when reserves data not available', () => {
    useCouncilConfig.mockReturnValue(mockConfig)
    useData.mockImplementation((urls) => {
      if (Array.isArray(urls)) {
        return {
          data: [mockInsights, { findings: [], key_findings: [] }, { by_party: [] }, [], null],
          loading: false,
          error: null,
        }
      }
      if (urls === '/data/demographic_fiscal.json') {
        return {
          data: { fiscal_resilience_score: 55, threats: [{ type: 'test' }] },
          loading: false,
          error: null,
        }
      }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/Fiscal Resilience/)).toBeInTheDocument()
    expect(screen.queryByText(/months cover/)).not.toBeInTheDocument()
  })
})
