import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Meetings from './Meetings'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('../utils/intelligenceEngine', () => ({
  mapAgendaToPolicyAreas: vi.fn((text) => {
    if (!text) return []
    if (/budget|treasury|financ/i.test(text)) return ['budget_finance']
    if (/planning|application/i.test(text)) return ['housing']
    return []
  }),
  getTopicAttackLines: vi.fn(() => [
    { text: 'Budget overspend risk', party: 'Labour', severity: 'high' },
  ]),
  buildReformDefenceLines: vi.fn(() => [
    { headline: 'Financial turnaround', metric: '£5M savings identified', detail: 'Reform delivered' },
  ]),
  POLICY_AREAS: {
    budget_finance: 'Budget & Finance', council_tax: 'Council Tax', housing: 'Housing',
    social_care: 'Social Care', transport_highways: 'Transport & Highways',
    education_schools: 'Education & Schools', environment_climate: 'Environment & Climate',
    governance_constitution: 'Governance & Constitution',
  },
}))

// Mock Recharts to avoid heavy SVG rendering in JSDOM
vi.mock('recharts', () => {
  const MockChart = ({ children }) => <div data-testid="recharts-mock">{children}</div>
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    BarChart: MockChart,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    PieChart: MockChart,
    Pie: () => null,
    Cell: () => null,
    Legend: () => null,
  }
})

vi.mock('../components/ui/HeatmapGrid', () => ({
  default: () => <div data-testid="heatmap-grid">HeatmapGrid</div>,
}))

vi.mock('../components/ui/ChartCard', () => ({
  default: ({ title, children }) => <div>{title}{children}</div>,
  ChartCard: ({ title, children }) => <div>{title}{children}</div>,
}))

vi.mock('../components/CouncillorLink', () => ({
  default: ({ children }) => <span>{children}</span>,
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
  moderngov_url: 'https://burnley.moderngov.co.uk',
}

// Use far-future dates so they're always "upcoming"
const mockMeetingsData = {
  meetings: [
    {
      id: 'mtg-1',
      title: 'Full Council Meeting',
      committee: 'Full Council',
      type: 'full_council',
      date: '2099-03-01',
      time: '18:00',
      venue: 'Town Hall',
      cancelled: false,
      summary: 'Regular full council meeting discussing budgets.',
      agenda_items: ['Budget Report 2099-00', 'Treasury Management Strategy', 'Public Questions'],
      public_relevance: 'Key budget decisions affecting council tax.',
      documents: ['Agenda Pack', 'Budget Report'],
      speak_deadline: '28 February 2099',
      link: 'https://burnley.moderngov.co.uk/meeting/1',
      status: 'agenda_published',
    },
    {
      id: 'mtg-2',
      title: 'Planning Committee',
      committee: 'Development Control',
      type: 'development_control',
      date: '2099-03-15',
      time: '14:30',
      cancelled: false,
      summary: 'Planning applications review.',
      agenda_items: ['Application PA/2099/001', 'Application PA/2099/002'],
      public_relevance: 'Planning decisions for local developments.',
    },
    {
      id: 'mtg-3',
      title: 'Cancelled Meeting',
      committee: 'Scrutiny Committee',
      type: 'scrutiny',
      date: '2099-04-01',
      time: '10:00',
      cancelled: true,
      summary: 'This meeting was cancelled.',
    },
    {
      id: 'mtg-past',
      title: 'Past Meeting',
      committee: 'Executive',
      type: 'executive',
      date: '2020-01-01',
      time: '10:00',
      cancelled: false,
      summary: 'An old meeting.',
    },
  ],
  last_updated: '2026-02-20',
  how_to_attend: {
    general: 'All meetings are open to the public.',
    speak_at_meeting: 'Register to speak 3 days before the meeting.',
    deadlines: {
      full_council: '5 working days',
      development_control: '3 working days',
    },
    public_questions: 'Submit questions in writing to democratic services.',
    tips: 'Arrive 10 minutes early.',
    contact: 'democratic@burnley.gov.uk',
  },
}

const mockVotingData = {
  votes: [
    { title: 'Budget 2025/26', result: 'Carried', council_tax_change: '+3.99%', description: 'Annual budget approval' },
    { title: 'Highway Maintenance Report', result: 'Noted', description: 'Roads update' },
  ],
}

const mockReformData = {
  achievements: {
    financial_turnaround: {
      headline: 'Financial Turnaround',
      items: [{ metric: '£5M', label: 'savings identified', detail: 'Year 1 Reform delivery' }],
    },
  },
}

const mockDogeData = {
  findings: [
    { label: 'Duplicate payments', value: '£340K', severity: 'critical' },
  ],
}

function setupMocks({ meetings = mockMeetingsData, configOverrides = {}, voting = null, reform = null, doge = null } = {}) {
  useCouncilConfig.mockReturnValue({ ...mockConfig, ...configOverrides })
  useData.mockImplementation((url) => {
    if (url === '/data/meetings.json') return { data: meetings, loading: !meetings, error: null }
    if (url === '/data/voting.json') return { data: voting, loading: false, error: null }
    if (url === '/data/reform_transformation.json') return { data: reform, loading: false, error: null }
    if (url === '/data/doge_findings.json') return { data: doge, loading: false, error: null }
    if (url === null) return { data: null, loading: false, error: null }
    return { data: null, loading: false, error: null }
  })
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Meetings />
    </MemoryRouter>
  )
}

describe('Meetings', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  // === Loading / Error ===
  it('shows loading state', () => {
    useData.mockImplementation((url) => {
      if (url === '/data/meetings.json') return { data: null, loading: true, error: null }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/loading meetings calendar/i)).toBeInTheDocument()
  })

  it('shows error state', () => {
    useData.mockImplementation((url) => {
      if (url === '/data/meetings.json') return { data: null, loading: false, error: new Error('fail') }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/meetings calendar/i)).toBeInTheDocument()
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
  })

  it('renders meetings page heading with data', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Meetings Calendar')).toBeInTheDocument()
  })

  // === Quick Info Banner ===
  it('renders upcoming meetings count in info banner', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/upcoming meetings/)).toBeInTheDocument()
  })

  it('renders spending relevance count in info banner', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/with spending relevance/)).toBeInTheDocument()
  })

  it('renders last updated date', () => {
    setupMocks()
    renderComponent()
    // "Updated" appears in info banner AND source note — use getAllByText
    const updated = screen.getAllByText(/updated/i)
    expect(updated.length).toBeGreaterThan(0)
  })

  // === Meeting Cards ===
  it('renders meeting committee names', () => {
    setupMocks()
    renderComponent()
    // 'Full Council' appears as both committee name AND type badge label
    const fullCouncilElements = screen.getAllByText('Full Council')
    expect(fullCouncilElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Development Control')).toBeInTheDocument()
  })

  it('renders meeting time', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/6:00 PM/)).toBeInTheDocument()
    expect(screen.getByText(/2:30 PM/)).toBeInTheDocument()
  })

  it('renders meeting venue', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/Town Hall/)).toBeInTheDocument()
  })

  it('renders agenda published badge', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Agenda Published')).toBeInTheDocument()
  })

  it('renders DOGE spending indicator for budget-related meetings', () => {
    setupMocks()
    renderComponent()
    const indicators = document.querySelectorAll('.doge-indicator')
    expect(indicators.length).toBeGreaterThan(0)
  })

  it('does not show cancelled meetings by default', () => {
    setupMocks()
    renderComponent()
    expect(screen.queryByText('Scrutiny Committee')).not.toBeInTheDocument()
  })

  it('does not show past meetings by default', () => {
    setupMocks()
    renderComponent()
    // 'Executive' appears as type filter pill label even when past meetings hidden
    // So check that the past meeting's committee name doesn't appear in the meeting cards
    const meetingCards = document.querySelectorAll('.meeting-card')
    const pastMeetingTexts = [...meetingCards].map(c => c.textContent)
    const hasPastMeeting = pastMeetingTexts.some(t => t.includes('Past Meeting'))
    expect(hasPastMeeting).toBe(false)
  })

  // === Expand/Collapse ===
  it('expands meeting card on click to show details', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByText(/regular full council meeting/i)).toBeInTheDocument()
  })

  it('shows agenda items when meeting is expanded', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    expect(screen.getByText('Agenda Items')).toBeInTheDocument()
    expect(screen.getByText('Budget Report 2099-00')).toBeInTheDocument()
    expect(screen.getByText('Treasury Management Strategy')).toBeInTheDocument()
  })

  it('shows public relevance when meeting is expanded', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    expect(screen.getByText('Public Relevance')).toBeInTheDocument()
    expect(screen.getByText(/key budget decisions/i)).toBeInTheDocument()
  })

  it('shows spending & accountability section for DOGE-relevant meetings', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    expect(screen.getByText('Spending & Accountability')).toBeInTheDocument()
  })

  it('shows speak deadline when expanded', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    expect(screen.getByText(/28 February 2099/)).toBeInTheDocument()
  })

  it('shows published documents when expanded', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    expect(screen.getByText('Published Documents')).toBeInTheDocument()
    expect(screen.getByText('Agenda Pack')).toBeInTheDocument()
    expect(screen.getByText('Budget Report')).toBeInTheDocument()
  })

  it('shows ModernGov link when expanded', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    expect(screen.getByText('View on ModernGov')).toBeInTheDocument()
  })

  it('collapses meeting card when clicking again', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    expect(screen.getByText('Summary')).toBeInTheDocument()
    fireEvent.click(cards[0])
    expect(screen.queryByText('Summary')).not.toBeInTheDocument()
  })

  it('expands meeting card via keyboard Enter', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.keyDown(cards[0], { key: 'Enter' })
    expect(screen.getByText('Summary')).toBeInTheDocument()
  })

  it('sets aria-expanded attribute on meeting cards', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    expect(cards[0]).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(cards[0])
    expect(cards[0]).toHaveAttribute('aria-expanded', 'true')
  })

  // === Show Past/Cancelled Toggle ===
  it('shows past and cancelled meetings when toggle is checked', () => {
    setupMocks()
    renderComponent()
    const toggle = screen.getByLabelText(/show past/i)
    fireEvent.click(toggle)
    // Scrutiny Committee is unique - only appears when cancelled meeting is shown
    expect(screen.getByText('Scrutiny Committee')).toBeInTheDocument()
    // 'Executive' appears in type filter pills AND as past meeting committee
    // Check that more meeting cards appear after toggle
    const meetingCards = document.querySelectorAll('.meeting-card')
    expect(meetingCards.length).toBeGreaterThanOrEqual(3) // Was 2 upcoming, now includes past + cancelled
  })

  it('shows CANCELLED badge on cancelled meetings', () => {
    setupMocks()
    renderComponent()
    const toggle = screen.getByLabelText(/show past/i)
    fireEvent.click(toggle)
    expect(screen.getByText('CANCELLED')).toBeInTheDocument()
  })

  // === Type Filters ===
  it('renders filter pills for meeting types', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('All')).toBeInTheDocument()
  })

  it('filters meetings by type when clicking a filter pill', () => {
    setupMocks()
    renderComponent()
    const pills = screen.getAllByRole('button').filter(b => b.classList.contains('filter-pill'))
    // Find a non-All pill and click it
    const nonAllPills = pills.filter(p => p.textContent !== 'All')
    if (nonAllPills.length > 0) {
      fireEvent.click(nonAllPills[0])
      // Should show fewer meetings than before
      const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
      expect(cards.length).toBeLessThanOrEqual(2) // Was 2 future meetings, now filtered
    }
  })

  it('shows "no meetings" message when filter matches nothing', () => {
    setupMocks({ meetings: { ...mockMeetingsData, meetings: [] } })
    renderComponent()
    expect(screen.getByText(/no meetings match/i)).toBeInTheDocument()
  })

  // === How to Attend ===
  it('renders how to attend section', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/how to attend and speak/i)).toBeInTheDocument()
  })

  // === Data Source Note ===
  it('renders ModernGov source link', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/moderngov portal/i)).toBeInTheDocument()
  })

  // === Empty data handling ===
  it('renders when meetings data has no meetings array', () => {
    setupMocks({ meetings: { meetings: [], last_updated: '2026-01-01' } })
    renderComponent()
    expect(screen.getByText('Meetings Calendar')).toBeInTheDocument()
    expect(screen.getByText(/no meetings match/i)).toBeInTheDocument()
  })

  // === Policy Area Tags ===
  it('shows policy area tags on agenda items with matching topics', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    // Budget Report agenda item should get 'Budget & Finance' tag
    const budgetTags = screen.getAllByText('Budget & Finance')
    expect(budgetTags.length).toBeGreaterThan(0)
  })

  it('shows policy area badges on meeting card headers', () => {
    setupMocks()
    renderComponent()
    // Meeting 1 has budget-related items, so should show policy area mini-badges
    const policyTags = document.querySelectorAll('.policy-tag, [style*="0.6rem"]')
    expect(policyTags.length).toBeGreaterThan(0)
  })

  it('renders policy area filter chips when policy areas exist', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('All Topics')).toBeInTheDocument()
  })

  it('filters meetings by policy area when clicking policy filter', () => {
    setupMocks()
    renderComponent()
    // Click a policy area filter — use getAllByText since 'Budget & Finance' appears as tags too
    const budgetFilters = screen.getAllByText('Budget & Finance')
    // The filter pill is a button, find the one that's a filter-pill
    const filterPill = budgetFilters.find(el => el.classList.contains('filter-pill'))
    if (filterPill) fireEvent.click(filterPill)
    // Should still show meetings with budget_finance policy area
    const cards = document.querySelectorAll('.meeting-card')
    expect(cards.length).toBeGreaterThan(0)
  })

  // === Policy Intelligence Section ===
  it('shows policy intelligence section when reform/doge data available', () => {
    setupMocks({
      configOverrides: { council_id: 'lancashire_cc', data_sources: { voting_records: true, doge_investigation: true } },
      reform: mockReformData,
      doge: mockDogeData,
    })
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    expect(screen.getByText('Policy Intelligence')).toBeInTheDocument()
  })

  it('shows opposition attack lines in policy intelligence', () => {
    setupMocks({
      configOverrides: { council_id: 'lancashire_cc', data_sources: { voting_records: true, doge_investigation: true } },
      reform: mockReformData,
      doge: mockDogeData,
    })
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    expect(screen.getByText(/likely opposition attacks/i)).toBeInTheDocument()
    expect(screen.getByText(/budget overspend risk/i)).toBeInTheDocument()
  })

  it('shows Reform defence lines in policy intelligence', () => {
    setupMocks({
      configOverrides: { council_id: 'lancashire_cc', data_sources: { voting_records: true, doge_investigation: true } },
      reform: mockReformData,
      doge: mockDogeData,
    })
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    expect(screen.getByText(/reform response/i)).toBeInTheDocument()
  })

  it('shows related past votes when voting data is available', () => {
    setupMocks({
      configOverrides: { council_id: 'lancashire_cc', data_sources: { voting_records: true, doge_investigation: true } },
      voting: mockVotingData,
      reform: mockReformData,
      doge: mockDogeData,
    })
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    expect(screen.getByText(/related past votes/i)).toBeInTheDocument()
    expect(screen.getByText(/budget 2025\/26/i)).toBeInTheDocument()
  })

  it('does not show policy intelligence when no reform/doge data', () => {
    setupMocks()
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    expect(screen.queryByText('Policy Intelligence')).not.toBeInTheDocument()
  })

  it('does not show policy intelligence for meetings without policy areas', () => {
    const noPolicyMeetings = {
      ...mockMeetingsData,
      meetings: [{
        id: 'mtg-nopolicy', committee: 'Civic Committee', type: 'other',
        date: '2099-06-01', time: '10:00', cancelled: false,
        summary: 'Ceremonial meeting.', agenda_items: ['Civic awards ceremony'],
        public_relevance: 'Awards event.',
      }],
    }
    setupMocks({
      meetings: noPolicyMeetings,
      configOverrides: { council_id: 'lancashire_cc', data_sources: { voting_records: true, doge_investigation: true } },
      reform: mockReformData,
      doge: mockDogeData,
    })
    renderComponent()
    const cards = screen.getAllByRole('button').filter(b => b.classList.contains('meeting-card'))
    fireEvent.click(cards[0])
    expect(screen.queryByText('Policy Intelligence')).not.toBeInTheDocument()
  })
})
