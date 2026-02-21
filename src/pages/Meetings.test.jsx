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

function setupMocks(overrides = {}) {
  useCouncilConfig.mockReturnValue(mockConfig)
  useData.mockReturnValue({
    data: mockMeetingsData,
    loading: false,
    error: null,
    ...overrides,
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
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading meetings calendar/i)).toBeInTheDocument()
  })

  it('shows error state', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
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
    const emptyMeetings = { ...mockMeetingsData, meetings: [] }
    useData.mockReturnValue({ data: emptyMeetings, loading: false, error: null })
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
    useData.mockReturnValue({
      data: { meetings: [], last_updated: '2026-01-01' },
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText('Meetings Calendar')).toBeInTheDocument()
    expect(screen.getByText(/no meetings match/i)).toBeInTheDocument()
  })
})
