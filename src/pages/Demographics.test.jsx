import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Demographics from './Demographics'

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

const mockDemographics = {
  meta: { generated: '2026-02-14' },
  summary: {
    population: 94649,
    female_pct: 51.2,
    male_pct: 48.8,
    born_uk_pct: 88.5,
    born_outside_uk_pct: 11.5,
    employment_rate_pct: 52.1,
    unemployment_rate_pct: 5.3,
    ethnicity: {
      'White': { count: 80700, pct: 85.3 },
      'Asian': { count: 9654, pct: 10.2 },
    },
    religion: {
      'Christian': { count: 42700, pct: 45.1 },
      'Muslim': { count: 7761, pct: 8.2 },
      'No religion': { count: 36440, pct: 38.5 },
    },
  },
  council_totals: {
    age: {
      'Aged 4 years and under': 5200,
      'Aged 5 to 9 years': 5600,
      'Aged 65 to 74 years': 10500,
    },
  },
  wards: {
    'E05001450': {
      name: 'Burnley Wood',
      ethnicity: { 'White': 5214, 'Total': 7234 },
      age: { 'Total': 7234 },
    },
  },
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Demographics />
    </MemoryRouter>
  )
}

describe('Demographics', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state while data loads', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/error loading demographics/i)).toBeInTheDocument()
  })

  it('shows no-data message when demographics is null', () => {
    useData.mockReturnValue({ data: null, loading: false, error: null })
    renderComponent()
    expect(screen.getByText(/no demographics data available/i)).toBeInTheDocument()
  })

  it('renders the page heading with data', () => {
    useData.mockReturnValue({ data: mockDemographics, loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Demographics')).toBeInTheDocument()
  })
})
