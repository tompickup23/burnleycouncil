import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Integrity from './Integrity'

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

const mockIntegrity = {
  generated: '2026-02-16',
  methodology: 'AI-assisted',
  total_councillors: 45,
  councillors_checked: 45,
  data_sources: ['Companies House', 'Electoral Commission', 'FCA Register'],
  summary: {
    total_directorships_found: 32,
    active_directorships: 18,
    red_flags_total: 5,
    supplier_conflicts: 2,
    cross_council_conflicts: 1,
    disqualification_matches: 0,
    misconduct_patterns: 1,
    co_directors_mapped: 24,
    family_connections_found: 3,
    risk_distribution: { low: 35, medium: 6, elevated: 3, high: 1 },
  },
  councillors: [
    {
      councillor_id: 'c1',
      name: 'Test Councillor',
      ward: 'Test Ward',
      party: 'Labour',
      risk_level: 'low',
      integrity_score: 85,
      data_sources_checked: ['Companies House'],
      companies_house: { total_directorships: 1, active_directorships: 1, companies: [] },
      red_flags: [],
      supplier_conflicts: [],
      cross_council_conflicts: [],
      misconduct_patterns: [],
    },
  ],
}

const mockCouncillors = [
  { id: 'c1', name: 'Test Councillor', ward: 'Test Ward', party: 'Labour', party_color: '#dc241f' },
]

const mockInsights = { total_spend: 355000000, total_records: 30580 }

function renderComponent() {
  return render(
    <MemoryRouter>
      <Integrity />
    </MemoryRouter>
  )
}

describe('Integrity', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state while data loads', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading integrity data/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/unable to load integrity data/i)).toBeInTheDocument()
  })

  it('renders the page heading with data', () => {
    useData.mockReturnValue({ data: [mockIntegrity, mockCouncillors, mockInsights], loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Councillor Integrity Checker')).toBeInTheDocument()
  })

  it('renders councillor name from data', () => {
    useData.mockReturnValue({ data: [mockIntegrity, mockCouncillors, mockInsights], loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Test Councillor')).toBeInTheDocument()
  })
})
