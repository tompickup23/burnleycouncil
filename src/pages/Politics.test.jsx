import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Politics from './Politics'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="xaxis" />,
  YAxis: () => <div data-testid="yaxis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Cell: () => <div data-testid="cell" />,
}))

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
  data_sources: {},
}

const mockConfigWithVoting = {
  ...mockConfig,
  council_id: 'lancashire_cc',
  council_name: 'Lancashire',
  data_sources: { voting_records: true },
}

const mockCouncillors = [
  { id: 1, name: 'Alice Smith', party: 'Labour', ward: 'Cliviger', party_color: '#dc241f', email: 'alice@burnley.gov.uk', phone: '01onal', roles: ['Executive Member'], moderngov_uid: '1001' },
  { id: 2, name: 'Bob Jones', party: 'Conservative', ward: 'Brunshaw', party_color: '#0087dc', email: 'bob@burnley.gov.uk', moderngov_uid: '1002' },
  { id: 3, name: 'Carol Lee', party: 'Labour', ward: 'Daneshouse', party_color: '#dc241f', moderngov_uid: '1003', group_role: 'leader', group_name: 'Labour', dual_hatted: ['chorley'], notable: ['Former council leader (2015-2020)', 'Raised housing concerns'] },
  { id: 4, name: 'Dave Brown', party: 'Green Party', ward: 'Gannow', party_color: '#6ab023', moderngov_uid: '1004', roles: ['Planning Committee', 'Scrutiny Committee', 'Overview Panel', 'Transport Board'] },
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

const mockSummaryWithOpposition = {
  ...mockSummary,
  opposition_groups: [
    {
      name: 'Progressive Coalition',
      formal_opposition: true,
      seats: 5,
      composition: [
        { party: 'Independent', count: 3 },
        { party: 'Green Party', count: 2 },
      ],
      leader: 'Jane Doe',
      leader_ward: 'Central',
      deputy_leader: 'John Roe',
      deputy_leader_ward: 'East',
      color: '#6AB023',
    },
    {
      name: 'Conservative',
      formal_opposition: false,
      seats: 3,
      composition: [{ party: 'Conservative', count: 3 }],
      leader: 'Tom Test',
      leader_ward: 'West',
      deputy_leader: null,
      deputy_leader_ward: null,
      color: '#0087DC',
    },
  ],
}

const mockVotingData = {
  last_updated: '2026-02-21T10:00:00',
  source: 'https://council.example.gov.uk',
  total_recorded_votes: 3,
  votes: [
    {
      id: '2024-02-23-budget-2024-25',
      meeting: 'Budget Meeting, Full Council, Friday, 23rd February, 2024',
      meeting_date: '2024-02-23',
      title: 'Budget 2024/25',
      type: 'budget',
      is_amendment: false,
      amendment_by: null,
      description: 'The Conservative administration\'s main revenue and capital budget for 2024/25, including a 4.99% council tax increase.',
      policy_area: ['budget_finance', 'council_tax'],
      significance: 'high',
      council_tax_change: '4.99% increase (2.99% core + 2% ASC precept). Band D set at £1,653.29',
      proposer: 'Cllr Phillippa Williamson (Conservative, Leader)',
      seconder: 'Cllr Alan Vincent (Conservative, Deputy Leader)',
      key_facts: ['4.99% total council tax increase — the maximum without a referendum', 'Transitional Reserve stood at £165.198m'],
      quotes: [],
      minutes_url: 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=16413',
      outcome: 'carried',
      for_count: 40,
      against_count: 29,
      abstain_count: 0,
      absent_count: 5,
      votes_by_councillor: [
        { name: 'Alice Smith', uid: '1001', vote: 'for' },
        { name: 'Bob Jones', uid: '1002', vote: 'against' },
      ],
      votes_by_party: {
        Labour: { for: 2, against: 0, abstain: 0, absent: 0 },
        Conservative: { for: 0, against: 1, abstain: 0, absent: 0 },
      },
    },
    {
      id: '2024-02-23-budget-labour-amendment',
      meeting: 'Budget Meeting, Full Council, Friday, 23rd February, 2024',
      meeting_date: '2024-02-23',
      title: 'Budget 2024/25 - Labour Amendment',
      type: 'budget',
      is_amendment: true,
      amendment_by: 'Labour',
      description: 'Labour amendment proposing £35 million in capital spending for children\'s care and highway repairs.',
      policy_area: ['budget_finance', 'social_care', 'transport_highways'],
      significance: 'high',
      council_tax_change: null,
      proposer: 'Cllr Matthew Tomlinson (Labour)',
      seconder: 'Cllr Noordad Aziz (Labour)',
      key_facts: ['S151 officer warned this would create a 2025/26 deficit of £10.885m'],
      quotes: [],
      minutes_url: null,
      outcome: 'rejected',
      for_count: 29,
      against_count: 40,
      abstain_count: 2,
      absent_count: 3,
      votes_by_councillor: [],
      votes_by_party: {},
    },
    {
      id: '2023-12-14-water-companies',
      meeting: 'Full Council, Thursday, 14th December, 2023',
      meeting_date: '2023-12-14',
      title: 'Notice of Motion 4 - Water Companies',
      type: 'motion',
      is_amendment: false,
      amendment_by: null,
      description: 'Motion on water company accountability prompted by sewage discharges on the Fylde Coast.',
      policy_area: ['environment_climate'],
      significance: 'medium',
      council_tax_change: null,
      proposer: 'Cllr Lorraine Beavers (Labour)',
      seconder: 'Cllr Julie Gibson (Labour)',
      key_facts: ['Conservative amendment softened the original Labour motion'],
      quotes: [],
      minutes_url: 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=16303',
      outcome: 'carried',
      for_count: 44,
      against_count: 28,
      abstain_count: 0,
      absent_count: 2,
      votes_by_councillor: [],
      votes_by_party: {},
    },
  ],
  attendance: {
    date_range: '01 May 2025 to 21 Feb 2026',
    councillors: [
      { uid: '1001', name: 'Alice Smith', expected: 20, present: 19, present_virtual: 0, attendance_rate: 0.95 },
      { uid: '1002', name: 'Bob Jones', expected: 20, present: 14, present_virtual: 1, attendance_rate: 0.75 },
      { uid: '1003', name: 'Carol Lee', expected: 15, present: 15, present_virtual: 0, attendance_rate: 1.0 },
      { uid: '1004', name: 'Dave Brown', expected: 10, present: 5, present_virtual: 0, attendance_rate: 0.5 },
    ],
    by_party: {
      Labour: { avg_attendance_rate: 0.975, count: 2 },
      Conservative: { avg_attendance_rate: 0.75, count: 1 },
      'Green Party': { avg_attendance_rate: 0.5, count: 1 },
    },
  },
}

const mockData = [mockCouncillors, mockSummary, {}]

// Helper to set up mock with separate useData calls
// First call: councillors/summary/wards; Second call: voting.json
let useDataCallCount = 0
function setupMocks(overrides = {}, config = mockConfig, votingData = null) {
  useCouncilConfig.mockReturnValue(config)
  useDataCallCount = 0
  useData.mockImplementation((urls) => {
    useDataCallCount++
    // First call: councillors data
    if (Array.isArray(urls)) {
      return {
        data: overrides.data !== undefined ? overrides.data : mockData,
        loading: overrides.loading || false,
        error: overrides.error || null,
      }
    }
    // Second call: voting data
    return {
      data: votingData,
      loading: false,
      error: votingData ? null : new Error('Not found'),
    }
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
    setupMocks({ loading: true, data: null })
    renderComponent()
    expect(screen.getByText(/loading councillor data/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    setupMocks({ data: null, error: new Error('fail') })
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
    setupMocks({ data: [mockCouncillors, noCoalitionSummary, {}] })
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

  // === Section Navigation ===
  it('does not render section nav when only 2 items', () => {
    setupMocks()
    renderComponent()
    // Without voting data or opposition groups, only Composition + Councillors = 2
    expect(screen.queryByRole('navigation', { name: /page sections/i })).not.toBeInTheDocument()
  })

  it('renders section nav when opposition groups present', () => {
    setupMocks({ data: [mockCouncillors, mockSummaryWithOpposition, {}] })
    renderComponent()
    const nav = screen.getByRole('navigation', { name: /page sections/i })
    expect(nav).toBeInTheDocument()
    expect(within(nav).getByText('Composition')).toBeInTheDocument()
    expect(within(nav).getByText('Opposition Groups')).toBeInTheDocument()
    expect(within(nav).getByText('Councillors')).toBeInTheDocument()
  })

  it('renders section nav with all pills when voting data present', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    const nav = screen.getByRole('navigation', { name: /page sections/i })
    expect(nav).toBeInTheDocument()
    expect(within(nav).getByText('Attendance')).toBeInTheDocument()
    expect(within(nav).getByText('Recorded Votes')).toBeInTheDocument()
  })

  // === Opposition Groups ===
  it('renders opposition groups section when data exists', () => {
    setupMocks({ data: [mockCouncillors, mockSummaryWithOpposition, {}] })
    renderComponent()
    // "Opposition Groups" appears as both nav pill and section h2
    const matches = screen.getAllByText('Opposition Groups')
    expect(matches.length).toBeGreaterThanOrEqual(1)
    // Verify the section itself exists
    expect(document.querySelector('.opposition-section')).toBeInTheDocument()
  })

  it('does not render opposition groups when no data', () => {
    setupMocks()
    renderComponent()
    expect(screen.queryByText('Opposition Groups')).not.toBeInTheDocument()
  })

  it('renders opposition group names', () => {
    setupMocks({ data: [mockCouncillors, mockSummaryWithOpposition, {}] })
    renderComponent()
    expect(screen.getByText('Progressive Coalition')).toBeInTheDocument()
    // "Conservative" appears in both by_party and opposition groups
    const conservativeElements = screen.getAllByText('Conservative')
    expect(conservativeElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renders opposition group seat counts', () => {
    setupMocks({ data: [mockCouncillors, mockSummaryWithOpposition, {}] })
    renderComponent()
    expect(screen.getByText('5 seats')).toBeInTheDocument()
    expect(screen.getByText('3 seats')).toBeInTheDocument()
  })

  it('renders opposition group leaders', () => {
    setupMocks({ data: [mockCouncillors, mockSummaryWithOpposition, {}] })
    renderComponent()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('Tom Test')).toBeInTheDocument()
  })

  it('renders deputy leader when present', () => {
    setupMocks({ data: [mockCouncillors, mockSummaryWithOpposition, {}] })
    renderComponent()
    expect(screen.getByText('John Roe')).toBeInTheDocument()
    // deputy badge
    const deputyBadges = document.querySelectorAll('.deputy-badge')
    expect(deputyBadges.length).toBe(1)
  })

  it('renders leader ward', () => {
    setupMocks({ data: [mockCouncillors, mockSummaryWithOpposition, {}] })
    renderComponent()
    expect(screen.getByText('Central')).toBeInTheDocument()
    expect(screen.getByText('East')).toBeInTheDocument()
  })

  it('renders multi-party composition', () => {
    setupMocks({ data: [mockCouncillors, mockSummaryWithOpposition, {}] })
    renderComponent()
    // Progressive Coalition has 3 Independent + 2 Green Party
    expect(screen.getByText('3 Independent')).toBeInTheDocument()
    expect(screen.getByText('2 Green Party')).toBeInTheDocument()
  })

  it('renders official opposition badge', () => {
    setupMocks({ data: [mockCouncillors, mockSummaryWithOpposition, {}] })
    renderComponent()
    expect(screen.getByText('Official Opposition')).toBeInTheDocument()
  })

  it('does not render composition for single-party groups', () => {
    setupMocks({ data: [mockCouncillors, mockSummaryWithOpposition, {}] })
    renderComponent()
    // Conservative group has single-party composition, should not show comp chips
    const compChips = document.querySelectorAll('.group-composition')
    // Only Progressive Coalition should have composition chips
    expect(compChips.length).toBe(1)
  })

  // === Attendance Section ===
  it('renders attendance section when voting data has attendance', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    // "Attendance" appears in nav pill and section h2
    expect(document.querySelector('.attendance-section')).toBeInTheDocument()
    expect(document.querySelector('.attendance-section h2').textContent).toBe('Attendance')
  })

  it('does not render attendance section without voting data', () => {
    setupMocks()
    renderComponent()
    // "Attendance" as a section heading should not exist
    const h2s = document.querySelectorAll('h2')
    const attendanceH2 = Array.from(h2s).find(h => h.textContent === 'Attendance')
    expect(attendanceH2).toBeUndefined()
  })

  it('renders attendance date range', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    expect(screen.getByText('01 May 2025 to 21 Feb 2026')).toBeInTheDocument()
  })

  it('renders council average attendance stat', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    // Average: (0.95 + 0.75 + 1.0 + 0.5) / 4 = 0.80 → 80%
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('Council Average')).toBeInTheDocument()
  })

  it('renders best attendee stat', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    // Carol Lee: 100%
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText(/Best: Carol Lee/)).toBeInTheDocument()
  })

  it('renders worst attendee stat', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    // Dave Brown: 50%
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText(/Lowest: Dave Brown/)).toBeInTheDocument()
  })

  it('renders councillors tracked count', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    // 4 councillors tracked, shown as stat
    const statCards = document.querySelectorAll('.stat-card-mini')
    const trackedCard = Array.from(statCards).find(c => c.textContent.includes('Councillors Tracked'))
    expect(trackedCard).toBeDefined()
    expect(trackedCard.textContent).toContain('4')
  })

  it('renders attendance bar chart', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    expect(screen.getByText('Average Attendance by Party')).toBeInTheDocument()
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('attendance badge shows on councillor cards when data present', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    // Alice Smith: 95% attendance
    expect(screen.getByText('95% attendance')).toBeInTheDocument()
  })

  // === Recorded Votes Section ===
  it('renders recorded votes section when voting data has votes', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    // "Recorded Votes" appears in nav pill and section h2
    expect(document.querySelector('.votes-section')).toBeInTheDocument()
    expect(document.querySelector('.votes-section h2').textContent).toBe('Recorded Votes')
    expect(screen.getByText('3 recorded divisions since 2015')).toBeInTheDocument()
  })

  it('does not render votes section without voting data', () => {
    setupMocks()
    renderComponent()
    expect(screen.queryByText('Recorded Votes')).not.toBeInTheDocument()
  })

  it('renders budget badge on budget votes', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    const budgetBadges = document.querySelectorAll('.budget-badge')
    expect(budgetBadges.length).toBe(2) // Budget main + Budget amendment
  })

  it('renders amendment badge with party', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    expect(screen.getByText('Amendment (Labour)')).toBeInTheDocument()
  })

  it('renders Carried outcome badge', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    const carriedBadges = document.querySelectorAll('.outcome-carried')
    expect(carriedBadges.length).toBeGreaterThanOrEqual(1)
    expect(carriedBadges[0].textContent).toBe('Carried')
  })

  it('renders Rejected outcome badge', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    const rejectedBadges = document.querySelectorAll('.outcome-rejected')
    expect(rejectedBadges.length).toBeGreaterThanOrEqual(1)
    expect(rejectedBadges[0].textContent).toBe('Rejected')
  })

  it('renders vote counts', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    expect(screen.getByText('40 For')).toBeInTheDocument()
    expect(screen.getByText('29 Against')).toBeInTheDocument()
  })

  it('renders abstain count when non-zero', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    // Labour amendment has 2 abstain
    expect(screen.getByText('2 Abstain')).toBeInTheDocument()
  })

  it('expands vote card on click', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    const voteHeaders = document.querySelectorAll('.vote-card-header')
    fireEvent.click(voteHeaders[0]) // First vote card (budget, sorted first)
    // Should show meeting detail
    expect(screen.getByText('Budget Meeting, Full Council, Friday, 23rd February, 2024')).toBeInTheDocument()
  })

  it('collapses vote card on second click', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    const voteHeaders = document.querySelectorAll('.vote-card-header')
    fireEvent.click(voteHeaders[0]) // Expand
    expect(screen.getByText('Budget Meeting, Full Council, Friday, 23rd February, 2024')).toBeInTheDocument()
    fireEvent.click(voteHeaders[0]) // Collapse
    expect(screen.queryByText('Votes by Party')).not.toBeInTheDocument()
  })

  it('renders party vote breakdown table when expanded', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    const voteHeaders = document.querySelectorAll('.vote-card-header')
    fireEvent.click(voteHeaders[0])
    expect(screen.getByText('Votes by Party')).toBeInTheDocument()
    // Party vote table should have Labour and Conservative rows
    const table = document.querySelector('.party-vote-table')
    expect(table).toBeDefined()
  })

  it('renders individual votes details element when expanded', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    const voteHeaders = document.querySelectorAll('.vote-card-header')
    fireEvent.click(voteHeaders[0])
    expect(screen.getByText('2 individual votes')).toBeInTheDocument()
  })

  it('budget votes sorted first', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    const voteCards = document.querySelectorAll('.vote-card')
    // First two should be budget cards
    expect(voteCards[0].classList.contains('vote-budget')).toBe(true)
    expect(voteCards[1].classList.contains('vote-budget')).toBe(true)
    // Third is motion
    expect(voteCards[2].classList.contains('vote-budget')).toBe(false)
  })

  // === Councillor Card Enrichment ===
  it('renders group role badge on councillor card', () => {
    setupMocks()
    renderComponent()
    // Carol Lee has group_role: 'leader'
    expect(screen.getByText('Group Leader')).toBeInTheDocument()
  })

  it('renders dual-hatted badge on councillor card', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Dual-hatted')).toBeInTheDocument()
  })

  it('renders notable facts when card expanded', () => {
    setupMocks()
    renderComponent()
    // Carol Lee has notable facts — expand her card (she's at index 2)
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('councillor-card'))
    fireEvent.click(cards[2]) // Carol Lee
    expect(screen.getByText('Former council leader (2015-2020)')).toBeInTheDocument()
    expect(screen.getByText('Raised housing concerns')).toBeInTheDocument()
  })

  it('renders capped roles with +N more badge', () => {
    setupMocks()
    renderComponent()
    // Dave Brown has 4 roles, should show 3 + "+1 more"
    expect(screen.getByText('+1 more')).toBeInTheDocument()
  })

  it('shows all roles when card expanded', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('councillor-card'))
    fireEvent.click(cards[3]) // Dave Brown
    expect(screen.getByText('All committee roles:')).toBeInTheDocument()
    expect(screen.getByText('Transport Board')).toBeInTheDocument()
  })

  it('renders attendance detail when card expanded with voting data', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('councillor-card'))
    fireEvent.click(cards[0]) // Alice Smith
    expect(screen.getByText(/19 present out of 20 expected/)).toBeInTheDocument()
  })

  it('renders virtual attendance when present', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('councillor-card'))
    fireEvent.click(cards[1]) // Bob Jones — has 1 virtual
    expect(screen.getByText(/1 virtual/)).toBeInTheDocument()
  })
})

describe('Vote enrichment display', () => {
  const renderAndExpandVote = (voteTitle) => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    const header = screen.getByText(voteTitle).closest('button')
    fireEvent.click(header)
  }

  it('renders vote description when expanded', () => {
    renderAndExpandVote('Budget 2024/25')
    expect(screen.getByText(/Conservative administration's main revenue/)).toBeInTheDocument()
  })

  it('renders policy area tags', () => {
    renderAndExpandVote('Budget 2024/25')
    expect(screen.getByText('budget finance')).toBeInTheDocument()
    expect(screen.getByText('council tax')).toBeInTheDocument()
  })

  it('renders council tax change when present', () => {
    renderAndExpandVote('Budget 2024/25')
    expect(screen.getByText(/4\.99% increase/)).toBeInTheDocument()
  })

  it('does not render council tax change when null', () => {
    renderAndExpandVote('Budget 2024/25 - Labour Amendment')
    expect(screen.queryByText(/Council Tax:/)).not.toBeInTheDocument()
  })

  it('renders proposer and seconder', () => {
    renderAndExpandVote('Budget 2024/25')
    expect(screen.getByText(/Cllr Phillippa Williamson/)).toBeInTheDocument()
    expect(screen.getByText(/Cllr Alan Vincent/)).toBeInTheDocument()
  })

  it('renders key facts as bullet list', () => {
    renderAndExpandVote('Budget 2024/25')
    expect(screen.getByText(/4\.99% total council tax increase/)).toBeInTheDocument()
    expect(screen.getByText(/Transitional Reserve stood at/)).toBeInTheDocument()
  })

  it('renders significance badge for high-significance votes', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    const keyVoteBadges = screen.getAllByText('Key Vote')
    expect(keyVoteBadges.length).toBeGreaterThanOrEqual(2) // budget + amendment both high
  })

  it('does not render significance badge for medium votes', () => {
    setupMocks({}, mockConfigWithVoting, mockVotingData)
    renderComponent()
    // Water companies is medium significance - its card should not have Key Vote badge
    const waterCard = screen.getByText('Notice of Motion 4 - Water Companies').closest('.vote-card')
    expect(within(waterCard).queryByText('Key Vote')).not.toBeInTheDocument()
  })

  it('renders minutes link when url present', () => {
    renderAndExpandVote('Budget 2024/25')
    const link = screen.getByText('View meeting minutes')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', 'https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=16413')
  })

  it('does not render minutes link when url is null', () => {
    renderAndExpandVote('Budget 2024/25 - Labour Amendment')
    expect(screen.queryByText('View meeting minutes')).not.toBeInTheDocument()
  })

  it('renders multiple policy area tags for multi-area votes', () => {
    renderAndExpandVote('Budget 2024/25 - Labour Amendment')
    expect(screen.getByText('budget finance')).toBeInTheDocument()
    expect(screen.getByText('social care')).toBeInTheDocument()
    expect(screen.getByText('transport highways')).toBeInTheDocument()
  })

  it('does not render enrichment sections when fields are absent', () => {
    const bareVotingData = {
      ...mockVotingData,
      votes: [{
        id: 'bare-vote',
        meeting: 'Meeting',
        meeting_date: '2024-01-01',
        title: 'A Bare Vote',
        type: 'motion',
        is_amendment: false,
        amendment_by: null,
        outcome: 'carried',
        for_count: 10,
        against_count: 5,
        abstain_count: 0,
        absent_count: 0,
        votes_by_councillor: [],
        votes_by_party: {},
      }],
    }
    setupMocks({}, mockConfigWithVoting, bareVotingData)
    renderComponent()
    fireEvent.click(screen.getByText('A Bare Vote').closest('button'))
    expect(screen.queryByText('Key Facts')).not.toBeInTheDocument()
    expect(screen.queryByText('View meeting minutes')).not.toBeInTheDocument()
  })
})
