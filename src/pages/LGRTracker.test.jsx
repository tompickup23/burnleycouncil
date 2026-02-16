import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LGRTracker from './LGRTracker'

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

const mockLgrData = {
  meta: { consultation_closes: '2026-04-01', source_urls: { consultation: 'https://gov.uk' } },
  overview: { title: 'Lancashire LGR', status: 'Consultation', close_date: '2026-04-01' },
  proposed_models: [{
    id: 'gov-2u',
    name: 'Government 2-Unitary',
    short_name: '2 UA',
    submitted_by: 'Government',
    num_authorities: 2,
    authorities: [{ name: 'East', population: 800000, councils: ['burnley'], notes: 'Test' }],
  }],
  timeline: [{ date: '2026-02-05', event: 'Consultation opens', detail: 'Test', upcoming: false }],
  key_issues: [{ id: 'test', title: 'Test Issue', severity: 'high', description: 'Test desc' }],
  precedents: [{ area: 'Northumberland', year: 2009, councils_merged: 7, new_unitaries: 1, transition_cost: '£20M', annual_savings: '£15M', payback_period: '1.3 years', notes: 'Test' }],
  ccn_critique: null,
  ccn_analysis: null,
  independent_model: null,
  demographic_projections: null,
  political_context: null,
  national_context: null,
  ai_doge_analysis: null,
  ai_doge_proposals: null,
}

const mockCrossCouncil = { councils: [], generated: '2026-02-16' }

function renderComponent() {
  return render(
    <MemoryRouter>
      <LGRTracker />
    </MemoryRouter>
  )
}

describe('LGRTracker', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state while data loads', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading lgr tracker/i)).toBeInTheDocument()
  })

  it('shows unavailable message when data fails to load', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/lgr tracking data is not yet available/i)).toBeInTheDocument()
  })

  it('shows unavailable message when lgrData is null', () => {
    useData.mockReturnValue({ data: [null, null], loading: false, error: null })
    renderComponent()
    expect(screen.getByText(/lgr tracking data is not yet available/i)).toBeInTheDocument()
  })

  it('renders the page heading with data', () => {
    useData.mockReturnValue({ data: [mockLgrData, mockCrossCouncil], loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Tracker')).toBeInTheDocument()
  })
})
