import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

const mockProjections = {
  meta: { source: 'ONS 2022-based Sub-National Population Projections', council_id: 'burnley' },
  population_projections: { '2022': 95655, '2027': 98520, '2032': 100138, '2037': 101200, '2042': 101900, '2047': 102300 },
  age_projections: {
    '2022': { '0-15': 19577, '16-64': 58845, '65+': 17233 },
    '2032': { '0-15': 18200, '16-64': 59300, '65+': 22638 },
  },
  dependency_ratio_projection: { '2022': 62.6, '2027': 61.4, '2032': 64.3, '2037': 65.8 },
  working_age_pct_projection: { '2022': 61.5, '2032': 59.2 },
  growth_rate_pct: 6.9,
  asylum: {
    seekers_supported: 464,
    by_accommodation: { 'Dispersal Accommodation': 440, 'Contingency Accommodation - Hotel': 24 },
    trend: [
      { date: '31 Mar 2022', people: 85 },
      { date: '31 Mar 2023', people: 150 },
      { date: '31 Mar 2024', people: 320 },
      { date: '31 Mar 2025', people: 464 },
    ],
    latest_date: '31 Mar 2025',
  },
  resettlement: { total: 0 },
}

function setupMocks({ demographics = mockDemographics, projections = null } = {}) {
  useData.mockImplementation((url) => {
    if (url === '/data/demographics.json') return { data: demographics, loading: !demographics, error: null }
    if (url === '/data/demographic_projections.json') return { data: projections, loading: false, error: null }
    return { data: null, loading: false, error: null }
  })
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
    useData.mockImplementation((url) => {
      if (url === '/data/demographics.json') return { data: null, loading: true, error: null }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useData.mockImplementation((url) => {
      if (url === '/data/demographics.json') return { data: null, loading: false, error: new Error('fail') }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/error loading demographics/i)).toBeInTheDocument()
  })

  it('shows no-data message when demographics is null', () => {
    useData.mockImplementation(() => ({ data: null, loading: false, error: null }))
    renderComponent()
    expect(screen.getByText(/no demographics data available/i)).toBeInTheDocument()
  })

  it('renders the page heading with data', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Demographics')).toBeInTheDocument()
  })

  it('shows Census 2021 tab by default', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Census 2021' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows Projections tab when projection data available', () => {
    setupMocks({ projections: mockProjections })
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Projections' })).toBeInTheDocument()
  })

  it('shows Asylum tab when asylum data available', () => {
    setupMocks({ projections: mockProjections })
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Asylum & Migration' })).toBeInTheDocument()
  })

  it('does not show Projections tab without projection data', () => {
    setupMocks()
    renderComponent()
    expect(screen.queryByRole('tab', { name: 'Projections' })).not.toBeInTheDocument()
  })

  it('switches to Projections tab on click', () => {
    setupMocks({ projections: mockProjections })
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Projections' }))
    expect(screen.getByText('Population Trajectory')).toBeInTheDocument()
    expect(screen.getByText('Age Structure Shift')).toBeInTheDocument()
  })

  it('shows growth rate stat on Projections tab', () => {
    setupMocks({ projections: mockProjections })
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Projections' }))
    expect(screen.getByText('+6.9%')).toBeInTheDocument()
  })

  it('switches to Asylum tab on click', () => {
    setupMocks({ projections: mockProjections })
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Asylum & Migration' }))
    expect(screen.getByText('Asylum Seekers Supported')).toBeInTheDocument()
    expect(screen.getByText('464')).toBeInTheDocument()
  })
})
