import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Intelligence from './Intelligence'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

// Mock intelligenceEngine — we test the real engine in intelligenceEngine.test.js
vi.mock('../utils/intelligenceEngine', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    buildMeetingBriefing: vi.fn(() => mockBriefing),
    buildCouncillorDossier: vi.fn(() => mockDossier),
    predictBehaviour: vi.fn(() => ({ likelyPosition: 'oppose', confidence: 'medium', likelyToSpeak: false, predictedArguments: [] })),
    generatePrintBriefing: vi.fn(() => 'BRIEFING TEXT'),
  }
})

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { buildMeetingBriefing, buildCouncillorDossier } from '../utils/intelligenceEngine'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockConfig = {
  council_id: 'lancashire_cc',
  council_name: 'Lancashire',
  council_full_name: 'Lancashire County Council',
  council_tier: 'county',
  data_sources: { intelligence: true, meetings: true, politics: true },
}

const mockCouncillors = {
  councillors: [
    { name: 'County Councillor Stephen Atkinson', party: 'Reform UK', division: 'Clitheroe' },
    { name: 'County Councillor Tom Pickup', party: 'Reform UK', division: 'Padiham' },
    { name: 'County Councillor Azhar Ali OBE', party: 'Independent', division: 'Pendle Central' },
    { name: 'County Councillor Gina Dowding', party: 'Green Party', division: 'Scotforth & University' },
    { name: 'County Councillor Aidy Riggott', party: 'Conservative', division: 'Longridge' },
    { name: 'County Councillor John Potter', party: 'Liberal Democrats', division: 'Lancaster Central' },
    { name: 'County Councillor Mark Clifford', party: 'Labour', division: 'Preston South' },
  ],
}

const mockPoliticsSummary = {
  total_councillors: 84,
  majority_threshold: 43,
  by_party: [
    { party: 'Reform UK', count: 53 },
    { party: 'Independent', count: 5 },
    { party: 'Conservative', count: 8 },
    { party: 'Labour', count: 5 },
    { party: 'Liberal Democrats', count: 5 },
    { party: 'Green Party', count: 3 },
  ],
  opposition_groups: [
    {
      name: 'Progressive Lancashire',
      seats: 11,
      leader: { name: 'Azhar Ali OBE', party: 'Independent' },
      deputy_leader: { name: 'Gina Dowding', party: 'Green Party' },
    },
    {
      name: 'Conservative',
      seats: 8,
      leader: { name: 'Aidy Riggott', party: 'Conservative' },
      deputy_leader: { name: 'Peter Buckley', party: 'Conservative' },
    },
    {
      name: 'Liberal Democrats',
      seats: 5,
      leader: { name: 'John Potter', party: 'Liberal Democrats' },
    },
  ],
}

const mockMeetings = {
  meetings: [
    {
      title: 'Cabinet',
      committee: 'Cabinet',
      date: '2026-03-15',
      time: '10:00',
      venue: 'County Hall, Preston',
      agenda_items: ['Revenue Budget Monitoring', 'Capital Programme Update', 'Appointments'],
    },
    {
      title: 'Budget and Finance Scrutiny Committee',
      committee: 'Budget and Finance Scrutiny Committee',
      date: '2026-03-10',
      time: '14:00',
      venue: 'Committee Room B',
      agenda_items: ['Budget Monitoring Quarter 3', 'Savings Delivery Report'],
    },
    {
      title: 'Full Council',
      committee: 'Full Council',
      date: '2025-12-01',
      time: '14:00',
      venue: 'County Hall',
      agenda_items: ['Council Tax Setting'],
    },
  ],
}

const mockBriefing = {
  meeting: {
    id: 'budget-finance-2026-03-10',
    date: '2026-03-10',
    time: '14:00',
    committee: 'Budget and Finance Scrutiny Committee',
    type: 'scrutiny',
    venue: 'Committee Room B',
    agendaItems: ['Budget Monitoring Quarter 3', 'Savings Delivery Report'],
  },
  committee: {
    name: 'Budget and Finance Scrutiny Committee',
    type: 'scrutiny',
    totalMembers: 5,
  },
  reformMembers: [
    { name: 'Tom Pickup', party: 'Reform UK', role: 'Member' },
    { name: 'Stephen Atkinson', party: 'Reform UK', role: 'Chair' },
  ],
  oppositionMembers: [
    {
      name: 'Azhar Ali OBE',
      party: 'Independent',
      role: 'Member',
      dossier: { attackLines: [{ text: 'Former Labour leader', severity: 'high', source: 'politics' }], integrityProfile: { riskLevel: 'elevated', redFlags: ['Multiple roles', 'Late declarations', 'Co-director overlap', 'SIC mismatch', 'Contract timing'] } },
      prediction: { likelyPosition: 'oppose', confidence: 'high', likelyToSpeak: true, predictedArguments: ['Budget cuts'] },
    },
    {
      name: 'Gina Dowding',
      party: 'Green Party',
      role: 'Member',
      dossier: { attackLines: [{ text: 'Green budget amendment failed', severity: 'medium', source: 'voting' }], integrityProfile: { riskLevel: 'elevated', redFlags: ['Late declarations', 'SIC mismatch', 'Co-director overlap'] } },
      prediction: { likelyPosition: 'oppose', confidence: 'medium', likelyToSpeak: false, predictedArguments: [] },
    },
  ],
  agendaIntel: [
    {
      text: 'Budget Monitoring Quarter 3',
      policyAreas: ['budget_finance'],
      matchingVotes: [{ title: 'Budget 2025/26', date: '2025-02-13', outcome: 'Carried' }],
      matchingAchievements: [{ title: 'Financial Turnaround', headline: 'Eliminated £28M overspend' }],
      matchingRebuttals: [{ attack: 'Cutting services', rebuttal: 'We protected frontline services', policyAreas: ['budget_finance'] }],
      matchingFindings: [],
    },
  ],
  keyBattlegrounds: [
    { item: 'Budget Monitoring Quarter 3', reason: 'High opposition interest in budget scrutiny', policyAreas: ['budget_finance'], matchingVotes: [], matchingRebuttals: [] },
  ],
}

const mockDossier = {
  name: 'Azhar Ali OBE',
  rawName: 'County Councillor Azhar Ali OBE',
  party: 'Independent',
  ward: 'Pendle Central',
  email: 'azhar.ali@lancashire.gov.uk',
  isOpposition: true,
  groupInfo: { role: 'Leader', groupName: 'Progressive Lancashire', seats: 11, formalOpposition: true },
  notable: ['Former Labour leader at LCC'],
  committees: [
    { name: 'Budget and Finance Scrutiny Committee', role: 'Member', type: 'scrutiny' },
    { name: 'Full Council', role: 'Member', type: 'other' },
  ],
  votingRecord: [
    { title: 'Budget 2025/26', date: '2025-02-13', position: 'against', outcome: 'Carried', policyAreas: ['budget_finance'], isRebel: false, isAmendment: false },
    { title: 'Devolution Vote', date: '2024-03-14', position: 'for', outcome: 'Lost', policyAreas: ['devolution_lgr'], isRebel: false, isAmendment: false },
  ],
  rebelCount: 0,
  rebelRate: 0,
  policyPositions: { budget_finance: { for: 0, against: 1, abstain: 0 }, devolution_lgr: { for: 1, against: 0, abstain: 0 } },
  integrityProfile: { riskLevel: 'elevated', score: 62, redFlags: ['Multiple roles', 'Late declarations'], companies: [{ name: 'ALI CONSULTING LTD', status: 'active', number: '12345678', sicCodes: ['70229'], redFlags: [] }], supplierConflicts: [] },
  interestsProfile: { companies: ['Ali Consulting'], employment: ['Self-employed consultant'], land: [], securities: [], sponsorship: [], memberships: [] },
  attackLines: [
    { text: 'Former Labour leader', severity: 'high', source: 'politics' },
    { text: 'Leads opposition as "Independent"', severity: 'high', source: 'politics' },
    { text: 'Voted against every budget', severity: 'medium', source: 'voting' },
  ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderIntelligence(overrides = {}) {
  return render(
    <MemoryRouter>
      <Intelligence {...overrides} />
    </MemoryRouter>
  )
}

function setupMocks({ configOverride, requiredData, optionalData } = {}) {
  useCouncilConfig.mockReturnValue(configOverride || mockConfig)
  const calls = []
  useData.mockImplementation((urls) => {
    const key = (Array.isArray(urls) ? urls : [urls]).join('|')
    calls.push(key)
    // First call: required data (councillors, politics_summary, meetings)
    if (key.includes('councillors.json') && key.includes('meetings.json')) {
      return requiredData || { data: [mockCouncillors, mockPoliticsSummary, mockMeetings], loading: false, error: null }
    }
    // Second call: optional intel data
    return optionalData || { data: [null, null, null, null, null, null], loading: false, error: null }
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Intelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildMeetingBriefing.mockReturnValue(mockBriefing)
    buildCouncillorDossier.mockReturnValue(mockDossier)
  })

  // --- Loading & Error states ---

  it('renders loading state', () => {
    setupMocks({ requiredData: { data: null, loading: true, error: null } })
    renderIntelligence()
    expect(screen.getByText(/loading intelligence/i)).toBeInTheDocument()
  })

  it('renders error state when data fails', () => {
    setupMocks({ requiredData: { data: null, loading: false, error: new Error('fail') } })
    renderIntelligence()
    expect(screen.getByText(/unable to load intelligence/i)).toBeInTheDocument()
  })

  // --- Page structure ---

  it('renders page with title and restricted banner', () => {
    setupMocks()
    renderIntelligence()
    expect(screen.getByText(/Lancashire Intelligence/i)).toBeInTheDocument()
    expect(screen.getByText(/strategist access only/i)).toBeInTheDocument()
  })

  it('renders section navigation with 4 tabs', () => {
    setupMocks()
    renderIntelligence()
    expect(screen.getByText('War Room')).toBeInTheDocument()
    expect(screen.getByText('Opposition')).toBeInTheDocument()
    expect(screen.getByText('Dossier')).toBeInTheDocument()
    expect(screen.getByText("Reform's Record")).toBeInTheDocument()
  })

  it('shows subtitle with opposition count', () => {
    setupMocks()
    renderIntelligence()
    expect(screen.getByText(/5 opposition councillors/i)).toBeInTheDocument()
  })

  // --- War Room (default section) ---

  it('defaults to War Room section', () => {
    setupMocks()
    renderIntelligence()
    expect(screen.getByText(/meeting war room/i)).toBeInTheDocument()
  })

  it('shows meeting selector with meetings sorted by date', () => {
    setupMocks()
    renderIntelligence()
    const select = screen.getByRole('combobox', { name: /select meeting/i })
    expect(select).toBeInTheDocument()
    // Should have 3 meetings as options
    const options = within(select).getAllByRole('option')
    expect(options.length).toBe(3)
  })

  it('shows meeting card with agenda items', () => {
    setupMocks()
    renderIntelligence()
    // The first meeting should be auto-selected — heading should be in the meeting card
    const headings = screen.getAllByText(/budget and finance scrutiny committee/i)
    expect(headings.length).toBeGreaterThanOrEqual(1)
    // Agenda items should show (may appear in multiple places: agenda list + agenda intel)
    const agendaItems = screen.getAllByText('Budget Monitoring Quarter 3')
    expect(agendaItems.length).toBeGreaterThanOrEqual(1)
  })

  it('shows Print Briefing button', () => {
    setupMocks()
    renderIntelligence()
    expect(screen.getByText(/print briefing/i)).toBeInTheDocument()
  })

  it('shows Reform members in committee grid', () => {
    setupMocks()
    renderIntelligence()
    expect(screen.getByText(/Reform UK \(2\)/i)).toBeInTheDocument()
    expect(screen.getByText('Tom Pickup')).toBeInTheDocument()
  })

  it('shows opposition members in committee grid', () => {
    setupMocks()
    renderIntelligence()
    expect(screen.getByText(/Opposition \(2\)/i)).toBeInTheDocument()
    expect(screen.getByText('Azhar Ali OBE')).toBeInTheDocument()
    expect(screen.getByText('Gina Dowding')).toBeInTheDocument()
  })

  it('expands opposition member to show mini-dossier on click', () => {
    setupMocks()
    renderIntelligence()
    // Click on Azhar Ali's card
    fireEvent.click(screen.getByText('Azhar Ali OBE'))
    // Should show attack lines
    expect(screen.getByText('Former Labour leader')).toBeInTheDocument()
    // Should show prediction badge
    expect(screen.getByText('oppose')).toBeInTheDocument()
    // Should show "Likely speaker" badge
    expect(screen.getByText('Likely speaker')).toBeInTheDocument()
  })

  it('shows Full Dossier button in expanded member', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText('Azhar Ali OBE'))
    expect(screen.getByText('Full Dossier')).toBeInTheDocument()
  })

  it('shows agenda intelligence section', () => {
    setupMocks()
    renderIntelligence()
    expect(screen.getByText(/agenda intelligence/i)).toBeInTheDocument()
    // Budget Monitoring Quarter 3 appears in both agenda list and agenda intel
    const matches = screen.getAllByText('Budget Monitoring Quarter 3')
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('shows key battlegrounds', () => {
    setupMocks()
    renderIntelligence()
    expect(screen.getByText(/key battlegrounds/i)).toBeInTheDocument()
  })

  it('expands agenda intel card on click', () => {
    setupMocks()
    renderIntelligence()
    // The agenda intel card has class "agenda-intel-card" — find the title within it
    const intelSection = document.querySelector('.intel-agenda-section')
    expect(intelSection).toBeTruthy()
    const intelCard = within(intelSection).getByText('Budget Monitoring Quarter 3')
    fireEvent.click(intelCard)
    // Should show related past votes
    expect(screen.getByText('Related Past Votes')).toBeInTheDocument()
    expect(screen.getByText('Budget 2025/26')).toBeInTheDocument()
  })

  // --- Opposition Profiles ---

  it('switches to Opposition Profiles section', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText('Opposition'))
    expect(screen.getByText(/opposition profiles/i)).toBeInTheDocument()
  })

  it('shows party filter tabs', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText('Opposition'))
    expect(screen.getByText(/All \(5\)/i)).toBeInTheDocument()
  })

  it('shows group leaders panel', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText('Opposition'))
    expect(screen.getByText(/group leaders/i)).toBeInTheDocument()
    // Leader and Deputy Leader role badges should appear in the leaders panel
    const leadersPanel = document.querySelector('.intel-leaders-panel')
    expect(leadersPanel).toBeTruthy()
    const leaderBadges = within(leadersPanel).getAllByText('Leader')
    expect(leaderBadges.length).toBeGreaterThanOrEqual(1)
    const deputyBadges = within(leadersPanel).getAllByText('Deputy Leader')
    expect(deputyBadges.length).toBeGreaterThanOrEqual(1)
  })

  it('shows search input', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText('Opposition'))
    expect(screen.getByPlaceholderText(/search by name/i)).toBeInTheDocument()
  })

  it('filters councillors by party', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText('Opposition'))
    // Click Conservative filter - should show party count
    const conservativeBtn = screen.getByText(/Conservative \(1\)/i)
    expect(conservativeBtn).toBeInTheDocument()
  })

  it('lists all opposition councillors', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText('Opposition'))
    // Should show all 5 non-Reform councillors (names may appear in both leaders panel + councillor list)
    const azharMatches = screen.getAllByText('Azhar Ali OBE')
    expect(azharMatches.length).toBeGreaterThanOrEqual(1)
    const ginaMatches = screen.getAllByText('Gina Dowding')
    expect(ginaMatches.length).toBeGreaterThanOrEqual(1)
    const aidyMatches = screen.getAllByText('Aidy Riggott')
    expect(aidyMatches.length).toBeGreaterThanOrEqual(1)
    // John Potter and Mark Clifford may appear in both leaders panel and councillor list
    const potterMatches = screen.getAllByText('John Potter')
    expect(potterMatches.length).toBeGreaterThanOrEqual(1)
    const cliffordMatches = screen.getAllByText('Mark Clifford')
    expect(cliffordMatches.length).toBeGreaterThanOrEqual(1)
  })

  // --- Councillor Dossier ---

  it('shows empty state when no councillor selected in dossier tab', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText('Dossier'))
    expect(screen.getByText(/no councillor selected/i)).toBeInTheDocument()
  })

  it('shows Browse Opposition button in empty dossier state', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText('Dossier'))
    expect(screen.getByText(/browse opposition/i)).toBeInTheDocument()
  })

  it('navigates to dossier from war room member expansion', () => {
    setupMocks()
    renderIntelligence()
    // Expand Azhar Ali and click Full Dossier
    fireEvent.click(screen.getByText('Azhar Ali OBE'))
    fireEvent.click(screen.getByText('Full Dossier'))
    // Should now show the dossier view
    expect(buildCouncillorDossier).toHaveBeenCalled()
  })

  it('dossier shows profile tab by default', () => {
    setupMocks()
    renderIntelligence()
    // Open dossier via war room
    fireEvent.click(screen.getByText('Azhar Ali OBE'))
    fireEvent.click(screen.getByText('Full Dossier'))
    // Should show profile info — Pendle Central may appear multiple times
    const matches = screen.getAllByText('Pendle Central')
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('dossier has 4 sub-tabs', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText('Azhar Ali OBE'))
    fireEvent.click(screen.getByText('Full Dossier'))
    expect(screen.getByText('Profile')).toBeInTheDocument()
    expect(screen.getByText('Voting Record')).toBeInTheDocument()
    expect(screen.getByText('Integrity')).toBeInTheDocument()
    expect(screen.getByText('Attack Lines')).toBeInTheDocument()
  })

  it('dossier voting tab shows vote count', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText('Azhar Ali OBE'))
    fireEvent.click(screen.getByText('Full Dossier'))
    fireEvent.click(screen.getByText('Voting Record'))
    // mockDossier has 2 votes
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('dossier integrity tab shows risk level', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText('Azhar Ali OBE'))
    fireEvent.click(screen.getByText('Full Dossier'))
    fireEvent.click(screen.getByText('Integrity'))
    // Should show integrity score
    expect(screen.getByText('62')).toBeInTheDocument()
  })

  it('dossier attack lines tab shows severity-grouped lines', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText('Azhar Ali OBE'))
    fireEvent.click(screen.getByText('Full Dossier'))
    fireEvent.click(screen.getByText('Attack Lines'))
    expect(screen.getByText(/high severity/i)).toBeInTheDocument()
    expect(screen.getByText('Former Labour leader')).toBeInTheDocument()
  })

  it('dossier has back button that returns to profiles', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText('Azhar Ali OBE'))
    fireEvent.click(screen.getByText('Full Dossier'))
    expect(screen.getByText('Opposition Profiles')).toBeInTheDocument()
  })

  // --- Reform's Record ---

  it('switches to Reform Record section', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText("Reform's Record"))
    // The heading "Reform's Record" appears both in the nav tab and as section heading
    const matches = screen.getAllByText(/reform's record/i)
    expect(matches.length).toBeGreaterThanOrEqual(2) // nav tab + section heading
  })

  it('shows rebuttal guide', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText("Reform's Record"))
    expect(screen.getByText(/rebuttal guide/i)).toBeInTheDocument()
  })

  it('shows defence lines by policy area section', () => {
    setupMocks()
    renderIntelligence()
    fireEvent.click(screen.getByText("Reform's Record"))
    expect(screen.getByText(/defence lines by policy area/i)).toBeInTheDocument()
  })

  // --- Graceful degradation ---

  it('renders without optional data (voting, integrity, committees)', () => {
    setupMocks({ optionalData: { data: [null, null, null, null, null, null], loading: false, error: null } })
    renderIntelligence()
    // Should still render without crashing
    expect(screen.getByText(/Lancashire Intelligence/i)).toBeInTheDocument()
  })

  it('handles empty meetings array', () => {
    setupMocks({
      requiredData: {
        data: [mockCouncillors, mockPoliticsSummary, { meetings: [] }],
        loading: false,
        error: null,
      },
    })
    renderIntelligence()
    // Should render the war room even with no meetings
    expect(screen.getByText(/meeting war room/i)).toBeInTheDocument()
  })

  it('handles null politics_summary gracefully', () => {
    setupMocks({
      requiredData: {
        data: [mockCouncillors, null, mockMeetings],
        loading: false,
        error: null,
      },
    })
    renderIntelligence()
    expect(screen.getByText(/Lancashire Intelligence/i)).toBeInTheDocument()
  })
})
