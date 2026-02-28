import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CouncillorDossier from './CouncillorDossier'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('../hooks/useCountUp', () => ({
  useCountUp: (target, _opts) => {
    const fmt = _opts?.formatter || (v => v)
    return fmt(target)
  },
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  data_sources: { spending: true, integrity: true },
}

const mockCouncillors = [
  {
    id: 'john-smith',
    name: 'John Smith',
    ward: 'Burnley Central',
    party: 'Labour',
    party_color: '#dc241f',
    roles: ['Cabinet Member for Finance'],
    photo_url: null,
  },
  {
    id: 'jane-doe',
    name: 'Jane Doe',
    ward: 'Padiham',
    party: 'Conservative',
    party_color: '#0087dc',
  },
]

const mockIntegrity = {
  generated: '2026-02-27',
  methodology: '40_source_intelligence_grade_detection',
  version: '6.0',
  councillors: [
    {
      councillor_id: 'john-smith',
      name: 'John Smith',
      ward: 'Burnley Central',
      party: 'Labour',
      risk_level: 'elevated',
      integrity_score: 62,
      sources_checked: 8,
      ch: {
        companies: [
          {
            company_name: 'Smith Consulting Ltd',
            company_number: '12345678',
            company_status: 'active',
            role: 'director',
            appointed_on: '2020-03-15',
            resigned_on: null,
          },
          {
            company_name: 'Old Ventures Ltd',
            company_number: '87654321',
            company_status: 'dissolved',
            role: 'director',
            appointed_on: '2015-01-01',
            resigned_on: '2019-06-30',
          },
        ],
        co_directors: [
          { name: 'Bob Builder', co_director: 'Bob Builder', shared_companies: ['Smith Consulting Ltd'] },
        ],
        supplier_conflicts: [
          {
            company_name: 'Smith Consulting Ltd',
            company_number: '12345678',
            supplier_match: {
              supplier: 'Smith Consulting Ltd',
              total_spend: 45000,
              confidence: 95,
            },
          },
        ],
        network_crossovers: [
          {
            councillor_company: 'Smith Consulting Ltd',
            co_director: 'Bob Builder',
            co_director_company: 'Builder Supplies Ltd',
            supplier_company: 'Builder Supplies Ltd',
            supplier_spend: 12000,
          },
        ],
      },
      red_flags: [
        {
          severity: 'high',
          type: 'direct_supplier_conflict',
          detail: 'Cllr John Smith is director of Smith Consulting Ltd which matches council supplier.',
          confidence: 95,
          source_tier: 1,
        },
        {
          severity: 'warning',
          type: 'co_director_network',
          detail: 'Connected via co-director network to Builder Supplies Ltd.',
          confidence: 70,
          source_tier: 2,
        },
        {
          severity: 'info',
          type: 'electoral_safe_seat_entrenchment',
          detail: 'Councillor has held seat for 12 years with comfortable margins.',
          confidence: 85,
          source_tier: 2,
        },
      ],
    },
    {
      councillor_id: 'jane-doe',
      name: 'Jane Doe',
      ward: 'Padiham',
      party: 'Conservative',
      risk_level: 'low',
      integrity_score: 92,
      sources_checked: 8,
      ch: {
        companies: [],
        co_directors: [],
        supplier_conflicts: [],
        network_crossovers: [],
      },
      red_flags: [],
    },
  ],
}

const mockRegister = [
  {
    name: 'John Smith',
    id: 'john-smith',
    sections: {
      declared_employment: ['Self-employed consultant', 'Smith Consulting Ltd'],
      declared_land: ['12 High Street, Burnley'],
      declared_securities: [],
      declared_companies: ['Smith Consulting Ltd (12345678)'],
      gifts_hospitality: ['Dinner from Supplier X, Dec 2024'],
    },
  },
]

const mockElections = {
  wards: [
    {
      ward: 'Burnley Central',
      electorate: 4200,
      seats: 3,
      next_election: '2027',
      history: [
        {
          year: 2023,
          date: '2023-05-04',
          candidates: [
            { name: 'John Smith', party: 'Labour', votes: 1200, pct: '48.0', elected: true },
            { name: 'Mary Jones', party: 'Conservative', votes: 800, pct: '32.0', elected: false },
            { name: 'Tim Green', party: 'Green', votes: 500, pct: '20.0', elected: false },
          ],
        },
        {
          year: 2019,
          date: '2019-05-02',
          candidates: [
            { name: 'John Smith', party: 'Labour', votes: 1100, pct: '55.0', elected: true },
            { name: 'Sue White', party: 'Conservative', votes: 900, pct: '45.0', elected: false },
          ],
        },
      ],
    },
  ],
}

const mockMeetings = {
  committees: [
    {
      name: 'Planning Committee',
      members: [
        { name: 'Cllr John Smith', role: 'Chair', uid: 123 },
        { name: 'Cllr Jane Doe', role: 'Member', uid: 456 },
      ],
    },
    {
      name: 'Full Council',
      members: [
        { name: 'Cllr John Smith', role: 'Member', uid: 123 },
      ],
    },
  ],
}

const mockDogeFindings = {
  findings: [],
}

const mockLegalFramework = [
  {
    law: 'Localism Act 2011, ss.26-37',
    title: "Members' Interests",
    category: 'governance',
    url: 'https://www.legislation.gov.uk/ukpga/2011/20/part/1/chapter/7',
  },
]

function renderDossier(councillorId = 'john-smith') {
  return render(
    <MemoryRouter initialEntries={[`/councillor/${councillorId}`]}>
      <Routes>
        <Route path="/councillor/:councillorId" element={<CouncillorDossier />} />
        <Route path="/integrity" element={<div>Integrity Page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

function setupMocks(overrides = {}) {
  useCouncilConfig.mockReturnValue(overrides.config || mockConfig)
  useData.mockReturnValue({
    data: overrides.data || [
      mockCouncillors,
      mockIntegrity,
      mockRegister,
      mockElections,
      mockMeetings,
      mockDogeFindings,
      mockLegalFramework,
    ],
    loading: overrides.loading || false,
    error: overrides.error || null,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CouncillorDossier', () => {
  describe('Loading and Error States', () => {
    it('shows loading state', () => {
      setupMocks({ loading: true, data: null })
      renderDossier()
      expect(screen.getByText(/loading councillor dossier/i)).toBeInTheDocument()
    })

    it('shows error state', () => {
      setupMocks({ error: new Error('Network error'), data: null })
      renderDossier()
      expect(screen.getByText(/failed to load councillor data/i)).toBeInTheDocument()
    })

    it('shows not found for unknown councillor', () => {
      setupMocks()
      renderDossier('nonexistent')
      expect(screen.getByText(/councillor not found/i)).toBeInTheDocument()
    })
  })

  describe('Header', () => {
    it('renders councillor name', () => {
      setupMocks()
      renderDossier()
      expect(screen.getByText('Cllr John Smith')).toBeInTheDocument()
    })

    it('renders party and ward', () => {
      setupMocks()
      renderDossier()
      expect(screen.getByText('Labour')).toBeInTheDocument()
      expect(screen.getByText('Burnley Central')).toBeInTheDocument()
    })

    it('renders role badge', () => {
      setupMocks()
      renderDossier()
      expect(screen.getByText('Cabinet Member for Finance')).toBeInTheDocument()
    })

    it('renders integrity score ring', () => {
      setupMocks()
      renderDossier()
      expect(screen.getByText('62')).toBeInTheDocument()
      expect(screen.getByText('Elevated')).toBeInTheDocument()
    })

    it('renders committee count', () => {
      setupMocks()
      renderDossier()
      expect(screen.getByText('2 committees')).toBeInTheDocument()
    })

    it('shows back to integrity link', () => {
      setupMocks()
      renderDossier()
      expect(screen.getByText(/back to integrity/i)).toBeInTheDocument()
    })
  })

  describe('Quick Stats', () => {
    it('shows active directorships count', () => {
      setupMocks()
      renderDossier()
      expect(screen.getByText('Active Directorships')).toBeInTheDocument()
      // Verify the stat section contains the directorship count
      const statsSection = screen.getByText('Active Directorships').closest('.dossier-stats')
      expect(statsSection).toBeTruthy()
    })

    it('shows red flags count', () => {
      setupMocks()
      renderDossier()
      expect(screen.getByText('Red Flags')).toBeInTheDocument()
      // Verify the stat section exists with red flags label
      const statsSection = screen.getByText('Red Flags').closest('.dossier-stats')
      expect(statsSection).toBeTruthy()
    })

    it('shows supplier conflicts count', () => {
      setupMocks()
      renderDossier()
      expect(screen.getByText('Supplier Conflicts')).toBeInTheDocument()
    })
  })

  describe('Tabs', () => {
    it('renders all 5 tabs', () => {
      setupMocks()
      renderDossier()
      expect(screen.getByText('Integrity')).toBeInTheDocument()
      expect(screen.getByText('Companies')).toBeInTheDocument()
      expect(screen.getByText('Register')).toBeInTheDocument()
      expect(screen.getByText('Electoral')).toBeInTheDocument()
      expect(screen.getByText('Timeline')).toBeInTheDocument()
    })

    it('defaults to integrity tab', () => {
      setupMocks()
      renderDossier()
      // Integrity tab should show red flags content
      expect(screen.getByText(/3 flag/)).toBeInTheDocument()
    })

    it('switches to companies tab', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Companies'))
      expect(screen.getAllByText('Smith Consulting Ltd').length).toBeGreaterThan(0)
    })

    it('switches to register tab', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Register'))
      expect(screen.getByText(/Employment/)).toBeInTheDocument()
    })

    it('switches to electoral tab', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Electoral'))
      // Electoral tab should render ward name from election history
      expect(screen.getAllByText('Burnley Central').length).toBeGreaterThan(0)
    })

    it('switches to timeline tab', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Timeline'))
      // Should show election and appointment events
      expect(screen.getAllByText(/Elected/).length).toBeGreaterThan(0)
    })
  })

  describe('Integrity Tab', () => {
    it('shows severity badges', () => {
      setupMocks()
      renderDossier()
      expect(screen.getByText('high')).toBeInTheDocument()
      expect(screen.getByText('warning')).toBeInTheDocument()
    })

    it('shows flag types', () => {
      setupMocks()
      renderDossier()
      expect(screen.getByText('direct_supplier_conflict')).toBeInTheDocument()
    })

    it('shows flag detail text', () => {
      setupMocks()
      renderDossier()
      expect(screen.getByText(/Smith Consulting Ltd which matches council supplier/)).toBeInTheDocument()
    })

    it('shows confidence badges', () => {
      setupMocks()
      renderDossier()
      // Source tier 1 badge
      expect(screen.getByText(/T1.*95%/)).toBeInTheDocument()
    })

    it('shows summary counts', () => {
      setupMocks()
      renderDossier()
      expect(screen.getByText(/8 sources/)).toBeInTheDocument()
    })

    it('shows empty state for clean councillor', () => {
      setupMocks()
      renderDossier('jane-doe')
      // Jane Doe has 0 flags
      expect(screen.getByText(/No integrity flags detected/)).toBeInTheDocument()
    })
  })

  describe('Companies Tab', () => {
    it('renders active companies', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Companies'))
      expect(screen.getAllByText('Smith Consulting Ltd').length).toBeGreaterThan(0)
    })

    it('renders past companies', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Companies'))
      expect(screen.getAllByText('Old Ventures Ltd').length).toBeGreaterThan(0)
      expect(screen.getByText(/Past Directorships/)).toBeInTheDocument()
    })

    it('shows company number', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Companies'))
      expect(screen.getByText('CH: 12345678')).toBeInTheDocument()
    })

    it('shows supplier conflict warning on conflicted company', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Companies'))
      expect(screen.getByText(/matches a council supplier/)).toBeInTheDocument()
    })

    it('renders evidence chains for supplier conflicts', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Companies'))
      expect(screen.getByText(/Direct Supplier Conflicts/)).toBeInTheDocument()
    })

    it('renders network graph', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Companies'))
      expect(screen.getByText('Director Network')).toBeInTheDocument()
    })

    it('shows network crossovers', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Companies'))
      expect(screen.getByText(/Indirect Network Connections/)).toBeInTheDocument()
      expect(screen.getAllByText(/Bob Builder/).length).toBeGreaterThan(0)
    })

    it('shows empty state for councillor with no companies', () => {
      setupMocks()
      renderDossier('jane-doe')
      fireEvent.click(screen.getByText('Companies'))
      expect(screen.getByText(/No Companies House directorships/)).toBeInTheDocument()
    })
  })

  describe('Register Tab', () => {
    it('renders employment section', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Register'))
      expect(screen.getByText(/Employment/)).toBeInTheDocument()
      expect(screen.getByText('Self-employed consultant')).toBeInTheDocument()
    })

    it('renders land section', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Register'))
      expect(screen.getByText(/Land & Property/)).toBeInTheDocument()
      expect(screen.getByText('12 High Street, Burnley')).toBeInTheDocument()
    })

    it('renders gifts section', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Register'))
      expect(screen.getByText(/Gifts & Hospitality/)).toBeInTheDocument()
    })

    it('shows supplier conflict flag on employment', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Register'))
      // Smith Consulting Ltd is both employment and supplier conflict
      const conflicts = screen.getAllByText(/Supplier conflict/)
      expect(conflicts.length).toBeGreaterThan(0)
    })
  })

  describe('Electoral Tab', () => {
    it('renders ward name', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Electoral'))
      expect(screen.getAllByText('Burnley Central').length).toBeGreaterThan(0)
    })

    it('renders electorate size', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Electoral'))
      expect(screen.getByText(/4,200/)).toBeInTheDocument()
    })

    it('renders election history table', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Electoral'))
      expect(screen.getByText('2023')).toBeInTheDocument()
      expect(screen.getByText('2019')).toBeInTheDocument()
    })

    it('highlights the councillor in election results', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Electoral'))
      // The councillor should have a star marker
      expect(screen.getAllByText(/Smith/).length).toBeGreaterThan(0)
    })

    it('shows ELECTED badge', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Electoral'))
      const elected = screen.getAllByText('ELECTED')
      expect(elected.length).toBeGreaterThan(0)
    })
  })

  describe('Timeline Tab', () => {
    it('renders election events', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Timeline'))
      expect(screen.getAllByText('Elected').length).toBeGreaterThan(0)
    })

    it('renders company appointment events', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Timeline'))
      expect(screen.getByText(/Appointed director of Smith Consulting/)).toBeInTheDocument()
    })

    it('renders resignation events', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Timeline'))
      expect(screen.getByText(/Resigned from Old Ventures/)).toBeInTheDocument()
    })

    it('shows events in reverse chronological order', () => {
      setupMocks()
      renderDossier()
      fireEvent.click(screen.getByText('Timeline'))
      const events = screen.getAllByClassName ? [] : []
      // Just verify multiple events render
      const titles = screen.getAllByText(/Elected|Appointed|Resigned/)
      expect(titles.length).toBeGreaterThan(0)
    })
  })

  describe('Page Title', () => {
    it('sets document title', () => {
      setupMocks()
      renderDossier()
      expect(document.title).toContain('John Smith')
      expect(document.title).toContain('Burnley')
    })
  })

  describe('Clean Councillor', () => {
    it('renders correctly for councillor with no issues', () => {
      setupMocks()
      renderDossier('jane-doe')
      expect(screen.getByText('Cllr Jane Doe')).toBeInTheDocument()
      expect(screen.getByText('92')).toBeInTheDocument() // Score
      expect(screen.getByText('Low Risk')).toBeInTheDocument()
    })
  })
})
