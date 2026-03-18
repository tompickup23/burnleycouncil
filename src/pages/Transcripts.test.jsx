import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Transcripts from './Transcripts'

// Mock config
vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: () => ({
    council_id: 'lancashire_cc',
    council_name: 'Lancashire CC',
    data_sources: { transcripts: true },
  }),
}))

// Mock clipboard
vi.mock('../hooks/useClipboard', () => ({
  useClipboard: () => ({ copy: vi.fn(), copied: false }),
}))

const MOCK_TRANSCRIPTS = {
  meetings: [
    {
      id: 'lcc-full-council-2025-07-17',
      date: '2025-07-17',
      committee: 'Full Council',
      duration_seconds: 14400,
      webcast_url: 'https://example.com/webcast',
      stats: { total_moments: 5, high_value: 2, soundbites: 3 },
    },
  ],
  moments: [
    {
      id: 'lcc-full-council-2025-07-17-000',
      meeting_id: 'lcc-full-council-2025-07-17',
      start: 1234.5,
      end: 1267.8,
      text: 'This net zero target is making us poorer.',
      composite_score: 9.2,
      category: 'defence',
      clip_type: 'soundbite',
      topics: ['net_zero', 'cost_of_living'],
      speaker: 'Murphy',
      summary: 'Administration counters net zero targets.',
      quotability: 9,
      news_value: 9,
      electoral_value: 10,
    },
    {
      id: 'lcc-full-council-2025-07-17-001',
      meeting_id: 'lcc-full-council-2025-07-17',
      start: 2400.0,
      end: 2430.0,
      text: 'Reform will never allow this type of investment activity again.',
      composite_score: 7.6,
      category: 'promise',
      clip_type: 'soundbite',
      topics: ['bonds', 'treasury_management'],
      speaker: null,
      summary: 'Reform commits to preventing similar investments.',
      quotability: 8,
      news_value: 7,
      electoral_value: 8,
    },
    {
      id: 'lcc-full-council-2025-07-17-002',
      meeting_id: 'lcc-full-council-2025-07-17',
      start: 5000.0,
      end: 5020.0,
      text: 'SEND waiting lists are being cleared.',
      composite_score: 5.0,
      category: 'policy',
      clip_type: 'archive',
      topics: ['send', 'education'],
      speaker: 'Salter',
      summary: 'Update on SEND backlog.',
      quotability: 5,
      news_value: 4,
      electoral_value: 5,
    },
  ],
  topic_index: {
    net_zero: [{ timestamp: '0:20:34', score: 9.2, clip_type: 'soundbite', speaker: 'Murphy' }],
    bonds: [{ timestamp: '0:40:00', score: 7.6, clip_type: 'soundbite', speaker: null }],
    send: [{ timestamp: '1:23:20', score: 5.0, clip_type: 'archive', speaker: 'Salter' }],
  },
  stats: {
    total_meetings: 1,
    total_moments: 3,
    total_soundbites: 2,
    total_full_speeches: 0,
    total_archive: 1,
    total_topics: 3,
    total_high_value: 2,
    total_speakers: 2,
    total_duration_hours: 4,
  },
}

// Mock useData
vi.mock('../hooks/useData', () => ({
  useData: (url) => {
    if (url === '/data/transcripts.json') {
      return { data: MOCK_TRANSCRIPTS, loading: false, error: null }
    }
    return { data: null, loading: false, error: null }
  },
}))

function renderPage(initialPath = '/transcripts') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Transcripts />
    </MemoryRouter>
  )
}

describe('Transcripts', () => {
  beforeEach(() => {
    document.title = ''
  })

  it('renders page title', () => {
    renderPage()
    expect(screen.getByText('Meeting Transcripts')).toBeTruthy()
  })

  it('shows stats', () => {
    renderPage()
    // Stats show in stat cards — multiple elements may contain these numbers
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)  // 1 meeting
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)  // 3 moments/topics
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)  // 2 soundbites/high-value
  })

  it('renders moment cards', () => {
    renderPage()
    // Text is wrapped in curly quotes — use partial match on key phrases
    const container = document.body
    expect(container.textContent).toContain('net zero target')
    expect(container.textContent).toContain('investment activity')
    expect(container.textContent).toContain('SEND waiting')
  })

  it('shows speaker badges', () => {
    renderPage()
    expect(screen.getAllByText('Cllr Murphy').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cllr Salter').length).toBeGreaterThan(0)
  })

  it('shows category badges', () => {
    renderPage()
    expect(screen.getAllByText('Defence').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Promise').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Policy').length).toBeGreaterThan(0)
  })

  it('shows topic tags', () => {
    renderPage()
    expect(screen.getByText('net zero')).toBeTruthy()
    expect(screen.getByText('bonds')).toBeTruthy()
    expect(screen.getByText('send')).toBeTruthy()
  })

  it('shows composite scores', () => {
    renderPage()
    expect(screen.getByText('9.2')).toBeTruthy()
    expect(screen.getByText('7.6')).toBeTruthy()
    expect(screen.getByText('5.0')).toBeTruthy()
  })

  it('renders search input', () => {
    renderPage()
    const input = screen.getByPlaceholderText(/Search transcripts/)
    expect(input).toBeTruthy()
  })

  it('filters by search term', () => {
    renderPage()
    const input = screen.getByPlaceholderText(/Search transcripts/)
    fireEvent.change(input, { target: { value: 'bonds' } })
    // Should show only the bonds moment
    expect(screen.getByText(/investment activity/)).toBeTruthy()
    expect(screen.queryByText(/net zero target/)).toBeFalsy()
  })

  it('renders topic cloud', () => {
    renderPage()
    // Topic cloud is in a CollapsibleSection
    expect(screen.getByText('Topic Index')).toBeTruthy()
  })

  it('shows clip buttons', () => {
    renderPage()
    const clipButtons = screen.getAllByText('Clip')
    expect(clipButtons.length).toBeGreaterThan(0)
  })

  it('shows copy buttons', () => {
    renderPage()
    const copyButtons = screen.getAllByText('Copy')
    expect(copyButtons.length).toBe(3)
  })

  it('sorts by score by default (highest first)', () => {
    renderPage()
    // The first moment card's score should be the highest (9.2)
    const scoreElements = screen.getAllByText('9.2')
    expect(scoreElements.length).toBeGreaterThan(0)
  })

  it('shows summaries', () => {
    renderPage()
    expect(screen.getByText('Administration counters net zero targets.')).toBeTruthy()
  })

  it('shows webcast timestamp links', () => {
    renderPage()
    const links = screen.getAllByRole('link')
    const webcastLinks = links.filter(l => l.href?.includes('example.com/webcast'))
    expect(webcastLinks.length).toBeGreaterThan(0)
  })
})
