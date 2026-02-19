import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ConstituencyView from './ConstituencyView'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(),
  }
})

vi.mock('recharts', () => ({
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => children,
  LineChart: () => null,
  Line: () => null,
}))

vi.mock('../components/ui', () => ({
  LoadingState: ({ message }) => <div>{message || 'Loading...'}</div>,
}))

vi.mock('./ConstituencyView.css', () => ({}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useParams } from 'react-router-dom'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
}

const mockConstituency = {
  id: 'burnley',
  name: 'Burnley',
  mp: {
    name: 'Oliver Ryan',
    party: 'Labour (Co-op)',
    photo_url: 'https://example.com/photo.jpg',
    elected: '2024-07-04',
    majority: 6975,
    majority_pct: 0.187,
    parliament_id: 5018,
  },
  ge2024: {
    result: 'Labour (Co-op) gain from Conservative',
    turnout: 37287,
    turnout_pct: 0.534,
    electorate: 69825,
    candidates: [
      { name: 'Oliver Ryan', party: 'Labour (Co-op)', votes: 16234, pct: 0.435 },
      { name: 'John Smith', party: 'Reform UK', votes: 9259, pct: 0.248 },
      { name: 'Jane Doe', party: 'Conservative', votes: 5431, pct: 0.146 },
    ],
  },
  voting_record: {
    voted_in: 298,
    total_career_divisions: 342,
    attendance_pct: 0.871,
    notable_votes: [
      { title: 'Rwanda Bill', date: '2024-12-01', mp_vote: 'Aye' },
    ],
  },
  parliamentary_activity: {
    written_questions: 45,
    oral_questions: 12,
    edms_sponsored: 8,
    edms_signed: 34,
    top_question_topics: ['Housing', 'NHS'],
  },
  mp_expenses: {
    total_claimed: 198543,
    salary: 91346,
    total_cost_to_taxpayer: 289889,
    year: '2024-25',
    rank_of_650: 234,
    staffing: 142000,
    office_costs: 28450,
    accommodation: 15200,
    travel: 8900,
    other: 3993,
  },
  claimant_count: [
    { date: '2025-12', month: 'December 2025', claimant_count: 3180, claimant_rate_pct: 6.2 },
    { date: '2025-11', month: 'November 2025', claimant_count: 3100, claimant_rate_pct: 6.0 },
  ],
  overlapping_councils: ['burnley'],
}

const mockConstituenciesData = {
  constituencies: [mockConstituency],
}

const mockElectionsRef = {
  party_colors: { Labour: '#DC241F', Conservative: '#0087DC' },
}

function renderWithRouter(constituencyId = 'burnley') {
  return render(
    <MemoryRouter initialEntries={[`/constituency/${constituencyId}`]}>
      <Routes>
        <Route path="/constituency/:constituencyId" element={<ConstituencyView />} />
      </Routes>
    </MemoryRouter>
  )
}

function mockDataLoaded() {
  useData.mockReturnValue({
    data: [mockConstituenciesData, mockElectionsRef],
    loading: false,
    error: null,
  })
}

describe('ConstituencyView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
    useParams.mockReturnValue({ constituencyId: 'burnley' })
  })

  // 1. Loading state
  it('renders loading state with message', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderWithRouter()
    expect(screen.getByText('Loading constituency data...')).toBeInTheDocument()
  })

  // 2. Error state
  it('renders error state when data fails to load', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('Network error') })
    renderWithRouter()
    expect(screen.getByText('Unable to load constituency data')).toBeInTheDocument()
    expect(screen.getByText('Please try again later.')).toBeInTheDocument()
  })

  // 3. Not found state
  it('renders not found state for unknown constituency ID', () => {
    useParams.mockReturnValue({ constituencyId: 'unknown-place' })
    useData.mockReturnValue({
      data: [mockConstituenciesData, mockElectionsRef],
      loading: false,
      error: null,
    })
    renderWithRouter('unknown-place')
    expect(screen.getByText('Constituency not found')).toBeInTheDocument()
    expect(screen.getByText(/No data found for constituency ID "unknown-place"/)).toBeInTheDocument()
  })

  // 4. Overview: MP name, party, constituency name
  it('shows MP name, party, and constituency name in overview', () => {
    mockDataLoaded()
    renderWithRouter()
    // MP name appears in hero section (h3) and candidate table — use getAllBy
    const mpNames = screen.getAllByText('Oliver Ryan')
    expect(mpNames.length).toBeGreaterThanOrEqual(1)
    // Party badge appears in hero and in candidate table
    const partyBadges = screen.getAllByText('Labour (Co-op)')
    expect(partyBadges.length).toBeGreaterThanOrEqual(1)
    // Constituency name in h1 header
    const heading = screen.getByRole('heading', { level: 1, name: 'Burnley' })
    expect(heading).toBeInTheDocument()
  })

  // 5. Overview: salary and total cost
  it('shows salary and total cost to taxpayer', () => {
    mockDataLoaded()
    renderWithRouter()
    // Salary appears in overview and expenses sections
    const salaryLabels = screen.getAllByText('Salary')
    expect(salaryLabels.length).toBeGreaterThanOrEqual(1)
    // formatMoneyWhole(91346) = "£91,346"
    const salaryValues = screen.getAllByText(/91,346/)
    expect(salaryValues.length).toBeGreaterThanOrEqual(1)
    // Total Cost to Taxpayer appears in overview hero
    const costLabels = screen.getAllByText('Total Cost to Taxpayer')
    expect(costLabels.length).toBeGreaterThanOrEqual(1)
    // formatMoneyWhole(289889) = "£289,889"
    const costValues = screen.getAllByText(/289,889/)
    expect(costValues.length).toBeGreaterThanOrEqual(1)
  })

  // 6. Election: GE2024 result
  it('shows GE2024 result in election section', () => {
    mockDataLoaded()
    renderWithRouter()
    expect(screen.getByText('Labour (Co-op) gain from Conservative')).toBeInTheDocument()
  })

  // 7. Election: candidate table
  it('shows candidate names in election results table', () => {
    mockDataLoaded()
    renderWithRouter()
    // Oliver Ryan appears in hero AND candidate table — use getAllByText
    const oliverRyans = screen.getAllByText('Oliver Ryan')
    expect(oliverRyans.length).toBeGreaterThanOrEqual(2) // hero + table
    // Other candidates appear only in table
    expect(screen.getByText('John Smith')).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    // Winner badge (may appear multiple times — "Elected" label in StatBox + badge)
    const electedElements = screen.getAllByText('Elected')
    expect(electedElements.length).toBeGreaterThanOrEqual(1)
  })

  // 8. Voting record: divisions voted in
  it('shows divisions voted in', () => {
    mockDataLoaded()
    renderWithRouter()
    expect(screen.getByText('Divisions Voted In')).toBeInTheDocument()
    // formatNumber(298) = "298"
    expect(screen.getByText('298')).toBeInTheDocument()
    expect(screen.getByText('Total Career Divisions')).toBeInTheDocument()
    expect(screen.getByText('342')).toBeInTheDocument()
  })

  // 9. Voting record: notable votes table
  it('shows notable votes in voting record section', () => {
    mockDataLoaded()
    renderWithRouter()
    expect(screen.getByText('Notable Votes')).toBeInTheDocument()
    expect(screen.getByText('Rwanda Bill')).toBeInTheDocument()
    expect(screen.getByText('Aye')).toBeInTheDocument()
  })

  // 10. Parliamentary activity: question counts
  it('shows written and oral question counts', () => {
    mockDataLoaded()
    renderWithRouter()
    expect(screen.getByText('Written Questions')).toBeInTheDocument()
    expect(screen.getByText('45')).toBeInTheDocument()
    expect(screen.getByText('Oral Questions')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  // 11. Parliamentary activity: topic tags
  it('shows top question topic tags', () => {
    mockDataLoaded()
    renderWithRouter()
    expect(screen.getByText('Housing')).toBeInTheDocument()
    expect(screen.getByText('NHS')).toBeInTheDocument()
  })

  // 12. Expenses: total claimed
  it('shows total expenses claimed', () => {
    mockDataLoaded()
    renderWithRouter()
    expect(screen.getByText('Total Claimed')).toBeInTheDocument()
    // formatMoney(198543) = "£198,543.00"
    expect(screen.getByText(/198,543/)).toBeInTheDocument()
  })

  // 13. Expenses: rank
  it('shows expenses rank out of 650 MPs', () => {
    mockDataLoaded()
    renderWithRouter()
    expect(screen.getByText('Rank')).toBeInTheDocument()
    expect(screen.getByText('234 / 650')).toBeInTheDocument()
  })

  // 14. Claimant count: latest figure
  it('shows latest claimant count figure', () => {
    mockDataLoaded()
    renderWithRouter()
    // Latest by date desc is December 2025 with 3,180
    expect(screen.getByText('3,180')).toBeInTheDocument()
    expect(screen.getByText('December 2025')).toBeInTheDocument()
  })

  // 15. Councils: overlapping councils
  it('shows overlapping councils with links', () => {
    mockDataLoaded()
    renderWithRouter()
    // "Burnley" appears as council card name via COUNCIL_NAMES mapping
    const councilLinks = screen.getAllByText('View on AI DOGE')
    expect(councilLinks.length).toBeGreaterThanOrEqual(1)
    // Council card links to aidoge.co.uk
    const link = screen.getByRole('link', { name: /Burnley.*View on AI DOGE/i })
    expect(link).toHaveAttribute('href', 'https://aidoge.co.uk/lancashire/burnleycouncil/')
  })

  // 16. Sources: data source badges
  it('renders data source badges in sources section', () => {
    mockDataLoaded()
    renderWithRouter()
    expect(screen.getByText('Parliament API')).toBeInTheDocument()
    expect(screen.getByText('IPSA')).toBeInTheDocument()
    expect(screen.getByText('Nomis / DWP')).toBeInTheDocument()
    expect(screen.getByText('Electoral Commission')).toBeInTheDocument()
  })

  // 17. Section nav: 8 buttons
  it('renders all 8 section navigation buttons', () => {
    mockDataLoaded()
    renderWithRouter()
    const navLabels = ['Overview', 'Election', 'Voting', 'Activity', 'Expenses', 'Claimants', 'Councils', 'Sources']
    navLabels.forEach(label => {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    })
  })

  // 18. Parliament.uk link with correct MP ID
  it('renders parliament.uk link with correct MP parliament ID', () => {
    mockDataLoaded()
    renderWithRouter()
    const parliamentLink = screen.getByRole('link', { name: /View on Parliament\.uk/i })
    expect(parliamentLink).toHaveAttribute('href', 'https://members.parliament.uk/member/5018/contact')
    expect(parliamentLink).toHaveAttribute('target', '_blank')
  })

  // 19. Back to Elections link
  it('renders back to Elections link', () => {
    mockDataLoaded()
    renderWithRouter()
    const backLink = screen.getByRole('link', { name: /Back to Elections/i })
    expect(backLink).toHaveAttribute('href', '/elections')
  })

  // 20. Page title is set correctly
  it('sets page title with constituency name', () => {
    mockDataLoaded()
    renderWithRouter()
    expect(document.title).toBe('Burnley | MP Profile | Burnley Council Transparency')
  })
})
