import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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
  data_sources: { spending: true },
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

function renderComponent() {
  return render(
    <MemoryRouter>
      <Integrity />
    </MemoryRouter>
  )
}

// Extended mock data with richer councillor records
const richCouncillors = [
  {
    councillor_id: 'c1',
    name: 'Alice Pemberton',
    ward: 'Burnley Central',
    party: 'Labour',
    risk_level: 'high',
    integrity_score: 35,
    checked_at: '2026-02-16T10:00:00Z',
    data_sources_checked: ['Companies House', 'Electoral Commission', 'FCA Register'],
    companies_house: {
      total_directorships: 4,
      active_directorships: 3,
      verification_method: 'register_and_dob',
      companies: [
        {
          company_name: 'Pemberton Consulting Ltd',
          company_number: '12345678',
          role: 'director',
          company_status: 'active',
          companies_house_url: 'https://find-and-update.company-information.service.gov.uk/company/12345678',
          verification: 'register_confirmed',
          declared_on_register: true,
          confidence: 95,
          red_flags: [{ detail: 'Company dissolved while active supplier', severity: 'warning' }],
          supplier_match: { supplier: 'Pemberton Consulting', total_spend: 45000, confidence: 92 },
        },
        {
          company_name: 'Alpha Holdings Ltd',
          company_number: '87654321',
          role: 'secretary',
          company_status: 'active',
          resigned_on: null,
          verification: 'ch_dob_confirmed',
          declared_on_register: false,
          confidence: 88,
        },
        {
          company_name: 'Old Corp Ltd',
          company_number: '11111111',
          role: 'director',
          resigned_on: '2024-06-15',
          company_status: 'dissolved',
          verification: 'ch_strong_proximity',
        },
        {
          company_name: 'Loose Match Inc',
          company_number: '99999999',
          role: 'director',
          company_status: 'active',
          verification: 'name_match_only',
        },
      ],
    },
    red_flags: [
      { detail: 'Active directorship overlaps with supplier payments', severity: 'critical', company: 'Pemberton Consulting Ltd' },
      { detail: 'Company dissolved during contract period', severity: 'warning', company: 'Old Corp Ltd' },
      { detail: 'Multiple active directorships exceeding threshold', severity: 'info' },
    ],
    supplier_conflicts: [
      {
        company_name: 'Pemberton Consulting Ltd',
        company_number: '12345678',
        conflict_type: 'commercial',
        severity: 'high',
        supplier_match: { supplier: 'Pemberton Consulting', total_spend: 45000, confidence: 92 },
      },
    ],
    cross_council_conflicts: [
      {
        company_name: 'Alpha Holdings Ltd',
        company_number: '87654321',
        conflict_type: 'commercial',
        other_council: 'Hyndburn',
        severity: 'warning',
        supplier_match: { supplier: 'Alpha Holdings', total_spend: 12000, confidence: 85 },
      },
    ],
    network_crossover: {
      total_links: 1,
      links: [
        {
          councillor_company: 'Pemberton Consulting Ltd',
          co_director: 'Bob Jones',
          co_director_company: 'Jones Services Ltd',
          co_director_company_number: '22222222',
          supplier_company: 'Jones Services',
          supplier_spend: 28000,
          link_type: 'co_director_also_directs_supplier',
          confidence: 78,
          severity: 'warning',
        },
      ],
    },
    co_director_network: {
      total_unique_associates: 2,
      associates: [
        { name: 'Bob Jones', shared_company_count: 1, roles: ['director'] },
        { name: 'Carol White', shared_company_count: 1, roles: ['secretary'] },
      ],
    },
    misconduct_patterns: [
      { detail: 'Pattern of late declaration of interests', severity: 'warning' },
    ],
    familial_connections: {
      has_family_supplier_conflict: true,
      family_member_companies: [
        {
          family_member_name: 'John Pemberton',
          relationship: 'spouse',
          active_companies: 2,
          supplier_conflicts: [
            {
              company_name: 'Pemberton Family Builders',
              supplier_match: { supplier: 'Pemberton Builders', total_spend: 15000, confidence: 80 },
            },
          ],
        },
      ],
    },
    electoral_commission: {
      findings: [
        { detail: 'Donation received from council supplier', type: 'supplier_donation', value: 5000 },
      ],
    },
    fca_register: {
      findings: [
        { detail: 'Previously registered as approved person at ABC Finance', severity: 'info' },
      ],
    },
    network_investigation: {
      advisable: true,
      priority: 'high',
      reasons: ['3+ active directorships', 'Direct supplier conflict', 'High risk profile'],
    },
    register_of_interests: {
      available: true,
      declared_companies: ['Pemberton Consulting Ltd'],
    },
  },
  {
    councillor_id: 'c2',
    name: 'Marcus Thornton',
    ward: 'Padiham',
    party: 'Conservative',
    risk_level: 'medium',
    integrity_score: 72,
    checked_at: '2026-02-16T10:00:00Z',
    data_sources_checked: ['Companies House'],
    companies_house: {
      total_directorships: 2,
      active_directorships: 1,
      companies: [
        {
          company_name: 'Thornton Property Ltd',
          company_number: '33333333',
          role: 'director',
          company_status: 'active',
          verification: 'ch_proximity_match',
        },
      ],
    },
    red_flags: [
      { detail: 'Undeclared directorship found', severity: 'warning' },
    ],
    supplier_conflicts: [],
    cross_council_conflicts: [],
    misconduct_patterns: [],
  },
  {
    councillor_id: 'c3',
    name: 'Naomi Fletcher',
    ward: 'Hapton',
    party: 'Labour',
    risk_level: 'low',
    integrity_score: 92,
    checked_at: '2026-02-16T10:00:00Z',
    data_sources_checked: ['Companies House'],
    companies_house: { total_directorships: 0, active_directorships: 0, companies: [] },
    red_flags: [],
    supplier_conflicts: [],
    cross_council_conflicts: [],
    misconduct_patterns: [],
  },
  {
    councillor_id: 'c4',
    name: 'Diana Greenwell',
    ward: 'Rose Hill',
    party: 'Green',
    risk_level: 'elevated',
    integrity_score: 55,
    checked_at: '2026-02-16T10:00:00Z',
    data_sources_checked: ['Companies House', 'Electoral Commission'],
    companies_house: {
      total_directorships: 3,
      active_directorships: 2,
      companies: [
        {
          company_name: 'Green Energy CIC',
          company_number: '44444444',
          role: 'director',
          company_status: 'active',
          verification: 'register_confirmed',
          declared_on_register: true,
        },
      ],
    },
    red_flags: [],
    supplier_conflicts: [
      {
        company_name: 'Green Energy CIC',
        company_number: '44444444',
        conflict_type: 'community_trustee',
        severity: 'info',
        supplier_match: { supplier: 'Green Energy Community', total_spend: 8000, confidence: 75 },
      },
    ],
    cross_council_conflicts: [],
    misconduct_patterns: [],
  },
  {
    councillor_id: 'c5',
    name: 'Edward Whitfield',
    ward: 'Coal Clough',
    party: 'Conservative',
    risk_level: 'low',
    integrity_score: 90,
    checked_at: '2026-02-16T10:00:00Z',
    data_sources_checked: ['Companies House'],
    companies_house: { total_directorships: 5, active_directorships: 0, companies: [] },
    red_flags: [],
    supplier_conflicts: [],
    cross_council_conflicts: [],
    misconduct_patterns: [],
  },
]

const richCouncillorsFull = [
  { id: 'c1', name: 'Alice Pemberton', ward: 'Burnley Central', party: 'Labour', party_color: '#dc241f' },
  { id: 'c2', name: 'Marcus Thornton', ward: 'Padiham', party: 'Conservative', party_color: '#0087dc' },
  { id: 'c3', name: 'Naomi Fletcher', ward: 'Hapton', party: 'Labour', party_color: '#dc241f' },
  { id: 'c4', name: 'Diana Greenwell', ward: 'Rose Hill', party: 'Green', party_color: '#6ab023' },
  { id: 'c5', name: 'Edward Whitfield', ward: 'Coal Clough', party: 'Conservative', party_color: '#0087dc' },
]

const richIntegrity = {
  generated: '2026-02-16',
  methodology: 'AI-assisted',
  version: '3.0',
  register_available: true,
  total_councillors: 5,
  councillors_checked: 5,
  data_sources: ['Companies House', 'Electoral Commission', 'FCA Register', 'Council Spending'],
  summary: {
    total_directorships_found: 10,
    active_directorships: 6,
    red_flags_total: 4,
    supplier_conflicts: 2,
    cross_council_conflicts: 1,
    disqualification_matches: 0,
    misconduct_patterns: 1,
    co_directors_mapped: 2,
    family_connections_found: 1,
    risk_distribution: { low: 2, medium: 1, elevated: 1, high: 1 },
  },
  councillors: richCouncillors,
  surname_clusters: [
    {
      surname: 'Hargreaves',
      count: 2,
      severity: 'warning',
      members: [
        { name: 'Jim Hargreaves', party: 'Labour', ward: 'Burnley Central' },
        { name: 'Sue Hargreaves', party: 'Conservative', ward: 'Burnley Central' },
      ],
      shared_address: false,
      same_ward: true,
      same_party: false,
    },
  ],
  cross_council_summary: {
    councillor_companies_in_other_councils: 1,
    affected_councils: ['Hyndburn'],
  },
}

/** Helper: get the councillor cards grid section */
function getCardsSection() {
  return document.querySelector('.integrity-grid')
}

/** Helper: get card names from the councillor card grid only */
function getCardNames() {
  const grid = getCardsSection()
  if (!grid) return []
  const cards = grid.querySelectorAll('.integrity-card')
  return [...cards].map(c => c.querySelector('h3')?.textContent)
}

function renderWithRichData() {
  useData.mockReturnValue({ data: [richIntegrity, richCouncillorsFull, null, null], loading: false, error: null })
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
    useData.mockReturnValue({ data: [mockIntegrity, mockCouncillors, null, null], loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Councillor Integrity Checker')).toBeInTheDocument()
  })

  it('renders councillor name from data', () => {
    useData.mockReturnValue({ data: [mockIntegrity, mockCouncillors, null, null], loading: false, error: null })
    renderComponent()
    expect(screen.getByText('Test Councillor')).toBeInTheDocument()
  })

  // ── Risk Distribution Dashboard ──

  describe('risk distribution dashboard', () => {
    it('renders summary stat for total councillors', () => {
      renderWithRichData()
      const dashboard = document.querySelector('.integrity-dashboard')
      expect(within(dashboard).getByText('Councillors')).toBeInTheDocument()
    })

    it('renders total directorships found', () => {
      renderWithRichData()
      const dashboard = document.querySelector('.integrity-dashboard')
      expect(within(dashboard).getByText('Directorships Found')).toBeInTheDocument()
      expect(within(dashboard).getByText('10')).toBeInTheDocument()
    })

    it('renders active directorships count', () => {
      renderWithRichData()
      const dashboard = document.querySelector('.integrity-dashboard')
      expect(within(dashboard).getByText('Active Directorships')).toBeInTheDocument()
    })

    it('renders red flags total', () => {
      renderWithRichData()
      const dashboard = document.querySelector('.integrity-dashboard')
      expect(within(dashboard).getByText('Red Flags')).toBeInTheDocument()
    })

    it('renders supplier connections count', () => {
      renderWithRichData()
      const dashboard = document.querySelector('.integrity-dashboard')
      expect(within(dashboard).getByText('Supplier Connections')).toBeInTheDocument()
    })

    it('renders risk distribution section with all risk levels', () => {
      renderWithRichData()
      expect(screen.getByText('Risk Distribution')).toBeInTheDocument()
      expect(screen.getByText('Low Risk', { selector: '.risk-bar-label' })).toBeInTheDocument()
      expect(screen.getByText('Medium', { selector: '.risk-bar-label' })).toBeInTheDocument()
      expect(screen.getByText('Elevated', { selector: '.risk-bar-label' })).toBeInTheDocument()
      expect(screen.getByText('High Risk', { selector: '.risk-bar-label' })).toBeInTheDocument()
    })

    it('renders risk distribution bar counts', () => {
      renderWithRichData()
      const bars = document.querySelectorAll('.risk-bar-count')
      const counts = [...bars].map(b => b.textContent)
      expect(counts).toContain('2')  // low
      expect(counts).toContain('1')  // medium, elevated, high
    })

    it('renders data sources checked', () => {
      renderWithRichData()
      expect(screen.getByText('Data Sources Checked')).toBeInTheDocument()
      const sourceSection = document.querySelector('.data-sources-list')
      const tags = sourceSection.querySelectorAll('.source-tag')
      const tagTexts = [...tags].map(t => t.textContent)
      expect(tagTexts).toContain('Companies House')
      expect(tagTexts).toContain('Electoral Commission')
      expect(tagTexts).toContain('FCA Register')
      expect(tagTexts).toContain('Council Spending')
    })

    it('renders co-directors mapped and family connections', () => {
      renderWithRichData()
      const dashboard = document.querySelector('.integrity-dashboard')
      expect(within(dashboard).getByText('Co-Directors Mapped')).toBeInTheDocument()
      expect(within(dashboard).getByText('Family Connections')).toBeInTheDocument()
    })
  })

  // ── Search Functionality ──

  describe('search functionality', () => {
    it('filters councillors by name', () => {
      renderWithRichData()
      const searchInput = screen.getByPlaceholderText('Search by name or ward...')
      fireEvent.change(searchInput, { target: { value: 'Alice' } })
      const names = getCardNames()
      expect(names).toContain('Alice Pemberton')
      expect(names).not.toContain('Marcus Thornton')
      expect(names).not.toContain('Naomi Fletcher')
    })

    it('filters councillors by ward name', () => {
      renderWithRichData()
      const searchInput = screen.getByPlaceholderText('Search by name or ward...')
      fireEvent.change(searchInput, { target: { value: 'Padiham' } })
      const names = getCardNames()
      expect(names).toContain('Marcus Thornton')
      expect(names).not.toContain('Alice Pemberton')
    })

    it('is case-insensitive', () => {
      renderWithRichData()
      const searchInput = screen.getByPlaceholderText('Search by name or ward...')
      fireEvent.change(searchInput, { target: { value: 'alice' } })
      const names = getCardNames()
      expect(names).toContain('Alice Pemberton')
    })

    it('clearing search shows all councillors', () => {
      renderWithRichData()
      const searchInput = screen.getByPlaceholderText('Search by name or ward...')
      fireEvent.change(searchInput, { target: { value: 'Alice' } })
      expect(getCardNames()).toHaveLength(1)
      fireEvent.change(searchInput, { target: { value: '' } })
      expect(getCardNames()).toHaveLength(5)
    })

    it('updates the filter count text', () => {
      renderWithRichData()
      expect(screen.getByText('5 of 5 councillors')).toBeInTheDocument()
      const searchInput = screen.getByPlaceholderText('Search by name or ward...')
      fireEvent.change(searchInput, { target: { value: 'Alice' } })
      expect(screen.getByText('1 of 5 councillors')).toBeInTheDocument()
    })

    it('has an accessible search label', () => {
      renderWithRichData()
      expect(screen.getByLabelText('Search councillors')).toBeInTheDocument()
    })
  })

  // ── Risk Filter ──

  describe('risk filter', () => {
    it('filters by high risk', () => {
      renderWithRichData()
      const riskSelect = screen.getByLabelText('Filter by risk level')
      fireEvent.change(riskSelect, { target: { value: 'high' } })
      const names = getCardNames()
      expect(names).toContain('Alice Pemberton')
      expect(names).not.toContain('Marcus Thornton')
      expect(names).not.toContain('Naomi Fletcher')
      expect(screen.getByText('1 of 5 councillors')).toBeInTheDocument()
    })

    it('filters by medium risk', () => {
      renderWithRichData()
      const riskSelect = screen.getByLabelText('Filter by risk level')
      fireEvent.change(riskSelect, { target: { value: 'medium' } })
      const names = getCardNames()
      expect(names).toContain('Marcus Thornton')
      expect(names).not.toContain('Alice Pemberton')
    })

    it('filters by elevated risk', () => {
      renderWithRichData()
      const riskSelect = screen.getByLabelText('Filter by risk level')
      fireEvent.change(riskSelect, { target: { value: 'elevated' } })
      const names = getCardNames()
      expect(names).toContain('Diana Greenwell')
      expect(names).not.toContain('Alice Pemberton')
    })

    it('shows empty results message when nothing matches', () => {
      renderWithRichData()
      const riskSelect = screen.getByLabelText('Filter by risk level')
      fireEvent.change(riskSelect, { target: { value: 'not_checked' } })
      expect(screen.getByText('No councillors match your filters.')).toBeInTheDocument()
      expect(screen.getByText('0 of 5 councillors')).toBeInTheDocument()
    })
  })

  // ── Party Filter ──

  describe('party filter', () => {
    it('filters by Labour party', () => {
      renderWithRichData()
      const partySelect = screen.getByLabelText('Filter by party')
      fireEvent.change(partySelect, { target: { value: 'Labour' } })
      const names = getCardNames()
      expect(names).toContain('Alice Pemberton')
      expect(names).toContain('Naomi Fletcher')
      expect(names).not.toContain('Marcus Thornton')
      expect(names).not.toContain('Diana Greenwell')
      expect(screen.getByText('2 of 5 councillors')).toBeInTheDocument()
    })

    it('filters by Conservative party', () => {
      renderWithRichData()
      const partySelect = screen.getByLabelText('Filter by party')
      fireEvent.change(partySelect, { target: { value: 'Conservative' } })
      const names = getCardNames()
      expect(names).toContain('Marcus Thornton')
      expect(names).toContain('Edward Whitfield')
      expect(names).not.toContain('Alice Pemberton')
    })

    it('filters by Green party', () => {
      renderWithRichData()
      const partySelect = screen.getByLabelText('Filter by party')
      fireEvent.change(partySelect, { target: { value: 'Green' } })
      const names = getCardNames()
      expect(names).toContain('Diana Greenwell')
      expect(screen.getByText('1 of 5 councillors')).toBeInTheDocument()
    })

    it('populates all parties in dropdown', () => {
      renderWithRichData()
      const partySelect = screen.getByLabelText('Filter by party')
      const options = within(partySelect).getAllByRole('option')
      const values = options.map(o => o.textContent)
      expect(values).toContain('All Parties')
      expect(values).toContain('Labour')
      expect(values).toContain('Conservative')
      expect(values).toContain('Green')
    })

    it('combines with search filter', () => {
      renderWithRichData()
      const searchInput = screen.getByPlaceholderText('Search by name or ward...')
      const partySelect = screen.getByLabelText('Filter by party')
      fireEvent.change(partySelect, { target: { value: 'Labour' } })
      fireEvent.change(searchInput, { target: { value: 'Naomi' } })
      const names = getCardNames()
      expect(names).toContain('Naomi Fletcher')
      expect(names).not.toContain('Alice Pemberton')
      expect(screen.getByText('1 of 5 councillors')).toBeInTheDocument()
    })
  })

  // ── Sort Options ──

  describe('sort options', () => {
    it('default sort is by risk (highest first)', () => {
      renderWithRichData()
      const names = getCardNames()
      // risk order: high (Alice), elevated (Diana), medium (Marcus), low (Naomi, Edward)
      expect(names[0]).toBe('Alice Pemberton')
      expect(names[1]).toBe('Diana Greenwell')
      expect(names[2]).toBe('Marcus Thornton')
    })

    it('sorts alphabetically by name', () => {
      renderWithRichData()
      const sortSelect = screen.getByLabelText('Sort by')
      fireEvent.change(sortSelect, { target: { value: 'name' } })
      const names = getCardNames()
      expect(names[0]).toBe('Alice Pemberton')
      expect(names[1]).toBe('Diana Greenwell')
      expect(names[2]).toBe('Edward Whitfield')
      expect(names[3]).toBe('Marcus Thornton')
      expect(names[4]).toBe('Naomi Fletcher')
    })

    it('sorts by most directorships', () => {
      renderWithRichData()
      const sortSelect = screen.getByLabelText('Sort by')
      fireEvent.change(sortSelect, { target: { value: 'directorships' } })
      const names = getCardNames()
      // Edward has 5 total, Alice has 4, Diana has 3, Marcus has 2, Naomi has 0
      expect(names[0]).toBe('Edward Whitfield')
      expect(names[1]).toBe('Alice Pemberton')
      expect(names[2]).toBe('Diana Greenwell')
      expect(names[3]).toBe('Marcus Thornton')
      expect(names[4]).toBe('Naomi Fletcher')
    })
  })

  // ── Councillor Card Expand/Collapse ──

  describe('councillor card expand/collapse', () => {
    it('clicking a councillor card header expands the detail', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Alice Pemberton').closest('.integrity-card-header')
      expect(document.querySelector('.integrity-detail')).not.toBeInTheDocument()
      fireEvent.click(header)
      expect(document.querySelector('.integrity-detail')).toBeInTheDocument()
    })

    it('clicking again collapses the detail', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Alice Pemberton').closest('.integrity-card-header')
      fireEvent.click(header)
      expect(document.querySelector('.integrity-detail')).toBeInTheDocument()
      fireEvent.click(header)
      expect(document.querySelector('.integrity-detail')).not.toBeInTheDocument()
    })

    it('expanding one councillor collapses previously expanded', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const aliceHeader = within(grid).getByText('Alice Pemberton').closest('.integrity-card-header')
      const marcusHeader = within(grid).getByText('Marcus Thornton').closest('.integrity-card-header')

      fireEvent.click(aliceHeader)
      expect(document.querySelectorAll('.integrity-detail')).toHaveLength(1)

      fireEvent.click(marcusHeader)
      expect(document.querySelectorAll('.integrity-detail')).toHaveLength(1)
    })

    it('sets aria-expanded correctly', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Alice Pemberton').closest('[role="button"]')
      expect(header).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(header)
      expect(header).toHaveAttribute('aria-expanded', 'true')
      fireEvent.click(header)
      expect(header).toHaveAttribute('aria-expanded', 'false')
    })

    it('keyboard Enter expands/collapses', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Alice Pemberton').closest('[role="button"]')
      fireEvent.keyDown(header, { key: 'Enter' })
      expect(header).toHaveAttribute('aria-expanded', 'true')
      fireEvent.keyDown(header, { key: 'Enter' })
      expect(header).toHaveAttribute('aria-expanded', 'false')
    })

    it('keyboard Space expands/collapses', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Alice Pemberton').closest('[role="button"]')
      fireEvent.keyDown(header, { key: ' ' })
      expect(header).toHaveAttribute('aria-expanded', 'true')
      fireEvent.keyDown(header, { key: ' ' })
      expect(header).toHaveAttribute('aria-expanded', 'false')
    })

    it('card header has tabIndex 0 for focus', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Alice Pemberton').closest('[role="button"]')
      expect(header).toHaveAttribute('tabindex', '0')
    })
  })

  // ── Expanded Detail Panel ──

  describe('expanded detail panel', () => {
    beforeEach(() => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Alice Pemberton').closest('.integrity-card-header')
      fireEvent.click(header)
    })

    it('renders integrity score', () => {
      const detail = document.querySelector('.integrity-detail')
      expect(within(detail).getByText('35')).toBeInTheDocument()
      expect(within(detail).getByText('Integrity Score')).toBeInTheDocument()
    })

    it('renders score ring SVG', () => {
      const ring = document.querySelector('.score-ring')
      expect(ring).toBeInTheDocument()
    })

    it('renders Companies House section with directorships', () => {
      const detail = document.querySelector('.integrity-detail')
      expect(within(detail).getByText(/Company Directorships/)).toBeInTheDocument()
      const companySection = detail.querySelector('.companies-section')
      expect(within(companySection).getByText('Pemberton Consulting Ltd')).toBeInTheDocument()
      expect(within(companySection).getByText('Alpha Holdings Ltd')).toBeInTheDocument()
    })

    it('renders verification badges', () => {
      const detail = document.querySelector('.integrity-detail')
      expect(within(detail).getByText(/Register \+ CH Verified/)).toBeInTheDocument()
      expect(within(detail).getByText(/DOB Confirmed/)).toBeInTheDocument()
    })

    it('renders verification method note', () => {
      expect(screen.getByText(/Register of interests \+ DOB confirmed/)).toBeInTheDocument()
    })

    it('renders active and resigned companies differently', () => {
      const activeRows = document.querySelectorAll('.company-row.active')
      const resignedRows = document.querySelectorAll('.company-row.resigned')
      expect(activeRows.length).toBeGreaterThan(0)
      expect(resignedRows.length).toBeGreaterThan(0)
    })

    it('renders Companies House external link', () => {
      const detail = document.querySelector('.integrity-detail')
      const chLinks = within(detail).getAllByText('Companies House')
      const linkEl = chLinks.find(el =>
        el.closest('a')?.getAttribute('href')?.includes('company-information.service.gov.uk')
      )
      expect(linkEl).toBeTruthy()
    })

    it('renders red flags with severity badges', () => {
      const detail = document.querySelector('.integrity-detail')
      expect(within(detail).getByText(/Red Flags/)).toBeInTheDocument()
      const flagsSection = detail.querySelector('.flags-section')
      const badges = flagsSection.querySelectorAll('.flag-severity')
      const badgeTexts = [...badges].map(b => b.textContent.trim())
      expect(badgeTexts).toContain('CRITICAL')
      expect(badgeTexts).toContain('WARNING')
      expect(badgeTexts).toContain('INFO')
    })

    it('renders red flag details', () => {
      expect(screen.getByText('Active directorship overlaps with supplier payments')).toBeInTheDocument()
      expect(screen.getByText('Company dissolved during contract period')).toBeInTheDocument()
    })

    it('renders red flag company name', () => {
      const flagCompanies = document.querySelectorAll('.flag-company')
      const companyNames = [...flagCompanies].map(f => f.textContent)
      expect(companyNames).toContain('Pemberton Consulting Ltd')
      expect(companyNames).toContain('Old Corp Ltd')
    })

    it('renders supplier conflicts section', () => {
      const detail = document.querySelector('.integrity-detail')
      expect(within(detail).getByText('Supplier Connections')).toBeInTheDocument()
    })

    it('renders supplier conflict type badge', () => {
      const conflictSection = document.querySelector('.conflicts-section:not(.cross-council)')
      expect(within(conflictSection).getByText('Commercial')).toBeInTheDocument()
    })

    it('renders supplier match confidence', () => {
      const detail = document.querySelector('.integrity-detail')
      expect(within(detail).getByText('92% match')).toBeInTheDocument()
    })

    it('renders cross-council conflicts section', () => {
      const detail = document.querySelector('.integrity-detail')
      expect(within(detail).getByText(/Cross-Council Connections/)).toBeInTheDocument()
      const crossCouncilSection = detail.querySelector('.conflicts-section.cross-council')
      expect(within(crossCouncilSection).getByText('Alpha Holdings Ltd')).toBeInTheDocument()
    })

    it('renders network investigation advisory for high-priority', () => {
      expect(screen.getByText('Network investigation advisable')).toBeInTheDocument()
      expect(screen.getByText('HIGH PRIORITY')).toBeInTheDocument()
    })

    it('renders network investigation reasons', () => {
      expect(screen.getByText('3+ active directorships')).toBeInTheDocument()
      expect(screen.getByText('Direct supplier conflict')).toBeInTheDocument()
      expect(screen.getByText('High risk profile')).toBeInTheDocument()
    })

    it('renders co-director network section', () => {
      const detail = document.querySelector('.integrity-detail')
      expect(within(detail).getByText(/Co-Director Network/)).toBeInTheDocument()
      const networkSection = detail.querySelector('.network-section')
      expect(within(networkSection).getByText('Bob Jones')).toBeInTheDocument()
      expect(within(networkSection).getByText('Carol White')).toBeInTheDocument()
    })

    it('renders misconduct patterns section', () => {
      const detail = document.querySelector('.integrity-detail')
      expect(within(detail).getByText(/Misconduct Patterns/)).toBeInTheDocument()
      expect(within(detail).getByText('Pattern of late declaration of interests')).toBeInTheDocument()
    })

    it('renders electoral commission findings', () => {
      expect(screen.getByText(/Electoral Commission Findings/)).toBeInTheDocument()
      expect(screen.getByText('Donation received from council supplier')).toBeInTheDocument()
    })

    it('renders FCA register findings', () => {
      expect(screen.getByText(/FCA Register Findings/)).toBeInTheDocument()
      expect(screen.getByText('Previously registered as approved person at ABC Finance')).toBeInTheDocument()
    })

    it('renders register of interests section', () => {
      const detail = document.querySelector('.integrity-detail')
      expect(within(detail).getByText(/Register of Interests/)).toBeInTheDocument()
    })

    it('renders register verification match info', () => {
      expect(screen.getByText(/declared interest\(s\) verified via Companies House/)).toBeInTheDocument()
    })
  })

  // ── buildConnectionNarrative and buildNetworkNarrative (tested indirectly via UI) ──

  describe('connection narrative rendering', () => {
    it('renders direct supplier conflict narrative via supplier investigation', () => {
      renderWithRichData()
      // buildConnectionNarrative output appears in supplier investigation section
      const narratives = document.querySelectorAll('.connection-narrative')
      const directNarrative = [...narratives].find(n =>
        n.textContent.includes('Cllr Alice Pemberton') &&
        n.textContent.includes('Pemberton Consulting Ltd')
      )
      expect(directNarrative).toBeTruthy()
    })

    it('narrative includes party and ward', () => {
      renderWithRichData()
      const narratives = document.querySelectorAll('.connection-narrative')
      const directNarrative = [...narratives].find(n =>
        n.textContent.includes('Alice Pemberton')
      )
      expect(directNarrative.textContent).toContain('Labour')
      expect(directNarrative.textContent).toContain('Burnley Central')
    })

    it('narrative includes confidence percentage', () => {
      renderWithRichData()
      const narratives = document.querySelectorAll('.connection-narrative')
      const directNarrative = [...narratives].find(n =>
        n.textContent.includes('Pemberton Consulting Ltd') && n.textContent.includes('director')
      )
      expect(directNarrative.textContent).toContain('92% match')
    })

    it('narrative includes total spend', () => {
      renderWithRichData()
      const narratives = document.querySelectorAll('.connection-narrative')
      const directNarrative = [...narratives].find(n =>
        n.textContent.includes('Pemberton Consulting Ltd') && n.textContent.includes('director')
      )
      // formatCurrency(45000) produces a currency string
      expect(directNarrative.textContent).toMatch(/45,000|45000/)
    })

    it('renders network crossover narrative', () => {
      renderWithRichData()
      const narratives = document.querySelectorAll('.connection-narrative')
      const networkNarrative = [...narratives].find(n =>
        n.textContent.includes('Bob Jones') && n.textContent.includes('Jones Services')
      )
      expect(networkNarrative).toBeTruthy()
      expect(networkNarrative.textContent).toContain('shares directorship')
    })

    it('network narrative includes spend', () => {
      renderWithRichData()
      const narratives = document.querySelectorAll('.connection-narrative')
      const networkNarrative = [...narratives].find(n =>
        n.textContent.includes('Bob Jones')
      )
      expect(networkNarrative.textContent).toMatch(/28,000|28000/)
    })
  })

  // ── Supplier Investigation Section ──

  describe('supplier investigation section', () => {
    it('renders the supplier investigation heading', () => {
      renderWithRichData()
      expect(screen.getByText('Supplier Investigation')).toBeInTheDocument()
    })

    it('renders supplier names with links', () => {
      renderWithRichData()
      const section = document.querySelector('.supplier-investigation-section')
      const links = section.querySelectorAll('.supplier-investigation-link')
      expect(links.length).toBeGreaterThan(0)
    })

    it('renders total spend for suppliers', () => {
      renderWithRichData()
      const spendElements = document.querySelectorAll('.supplier-investigation-spend')
      expect(spendElements.length).toBeGreaterThan(0)
    })

    it('renders Direct connection type badge', () => {
      renderWithRichData()
      const badges = document.querySelectorAll('.connection-type-badge')
      const badgeTexts = [...badges].map(b => b.textContent.trim())
      expect(badgeTexts.some(t => t.includes('Direct'))).toBe(true)
    })

    it('renders Network connection type badge for indirect links', () => {
      renderWithRichData()
      const badges = document.querySelectorAll('.connection-type-badge')
      const badgeTexts = [...badges].map(b => b.textContent.trim())
      expect(badgeTexts.some(t => t.includes('Network'))).toBe(true)
    })

    it('renders Cross-Council connection type badge', () => {
      renderWithRichData()
      const badges = document.querySelectorAll('.connection-type-badge')
      const badgeTexts = [...badges].map(b => b.textContent.trim())
      expect(badgeTexts.some(t => t.includes('Cross-Council'))).toBe(true)
    })

    it('renders View Councillor button', () => {
      renderWithRichData()
      const viewBtns = screen.getAllByText('View Councillor')
      expect(viewBtns.length).toBeGreaterThan(0)
    })

    it('clicking View Councillor expands that councillor', () => {
      renderWithRichData()
      const viewBtn = screen.getAllByText('View Councillor')[0]
      fireEvent.click(viewBtn)
      expect(document.querySelector('.integrity-detail')).toBeInTheDocument()
    })

    it('renders View Spending links', () => {
      renderWithRichData()
      const spendingLinks = screen.getAllByText('View Spending')
      expect(spendingLinks.length).toBeGreaterThan(0)
    })
  })

  // ── Scan Pending Banner ──

  describe('scan pending banner', () => {
    it('shows scan pending when councillors_checked is 0', () => {
      const uncheckedIntegrity = {
        ...richIntegrity,
        councillors_checked: 0,
      }
      useData.mockReturnValue({ data: [uncheckedIntegrity, richCouncillorsFull, null, null], loading: false, error: null })
      render(
        <MemoryRouter>
          <Integrity />
        </MemoryRouter>
      )
      expect(screen.getByText('Companies House scan pending')).toBeInTheDocument()
    })

    it('includes council_id in run command', () => {
      const uncheckedIntegrity = {
        ...richIntegrity,
        councillors_checked: 0,
      }
      useData.mockReturnValue({ data: [uncheckedIntegrity, richCouncillorsFull, null, null], loading: false, error: null })
      render(
        <MemoryRouter>
          <Integrity />
        </MemoryRouter>
      )
      expect(screen.getByText(/councillor_integrity_etl.py --council burnley/)).toBeInTheDocument()
    })

    it('does not show scan pending when councillors are checked', () => {
      renderWithRichData()
      expect(screen.queryByText('Companies House scan pending')).not.toBeInTheDocument()
    })
  })

  // ── Empty State ──

  describe('empty state', () => {
    it('shows no councillors match message when all filters exclude results', () => {
      renderWithRichData()
      const searchInput = screen.getByPlaceholderText('Search by name or ward...')
      fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } })
      expect(screen.getByText('No councillors match your filters.')).toBeInTheDocument()
    })

    it('shows empty message when risk + party filters exclude everything', () => {
      renderWithRichData()
      const riskSelect = screen.getByLabelText('Filter by risk level')
      const partySelect = screen.getByLabelText('Filter by party')
      fireEvent.change(riskSelect, { target: { value: 'high' } })
      fireEvent.change(partySelect, { target: { value: 'Green' } })
      expect(screen.getByText('No councillors match your filters.')).toBeInTheDocument()
    })
  })

  // ── Cross-Council Conflicts Section ──

  describe('cross-council conflicts section', () => {
    it('renders cross-council summary heading', () => {
      renderWithRichData()
      expect(screen.getByText('Cross-Council Summary')).toBeInTheDocument()
    })

    it('renders companies found in other councils count', () => {
      renderWithRichData()
      expect(screen.getByText('Companies Found in Other Councils')).toBeInTheDocument()
    })

    it('renders affected councils list', () => {
      renderWithRichData()
      const section = document.querySelector('.cross-council-summary-section')
      expect(within(section).getByText(/Affected councils:/)).toBeInTheDocument()
    })

    it('does not render cross-council section when no conflicts exist', () => {
      const noXCouncil = {
        ...richIntegrity,
        cross_council_summary: { councillor_companies_in_other_councils: 0 },
      }
      useData.mockReturnValue({ data: [noXCouncil, richCouncillorsFull, null, null], loading: false, error: null })
      render(
        <MemoryRouter>
          <Integrity />
        </MemoryRouter>
      )
      expect(screen.queryByText('Cross-Council Summary')).not.toBeInTheDocument()
    })
  })

  // ── Familial Connections Section ──

  describe('familial connections section', () => {
    it('renders familial connection analysis heading', () => {
      renderWithRichData()
      expect(screen.getByText('Familial Connection Analysis')).toBeInTheDocument()
    })

    it('renders surname cluster cards', () => {
      renderWithRichData()
      const clusterCard = document.querySelector('.familial-card')
      expect(clusterCard).toBeInTheDocument()
    })

    it('renders surname header', () => {
      renderWithRichData()
      const familialSection = document.querySelector('.familial-overview')
      expect(within(familialSection).getByText('Hargreaves')).toBeInTheDocument()
    })

    it('renders cluster member count', () => {
      renderWithRichData()
      const familialSection = document.querySelector('.familial-overview')
      expect(within(familialSection).getByText('2 councillors')).toBeInTheDocument()
    })

    it('renders cluster members with party and ward', () => {
      renderWithRichData()
      const familialSection = document.querySelector('.familial-overview')
      const members = familialSection.querySelectorAll('.familial-member')
      expect(members.length).toBe(2)
    })

    it('renders same ward flag for surname cluster', () => {
      renderWithRichData()
      expect(screen.getByText('Same Ward')).toBeInTheDocument()
    })

    it('does not render shared address flag when not applicable', () => {
      renderWithRichData()
      expect(screen.queryByText('Same Address')).not.toBeInTheDocument()
    })

    it('renders familial connections in expanded councillor detail', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Alice Pemberton').closest('.integrity-card-header')
      fireEvent.click(header)
      const detail = document.querySelector('.integrity-detail')
      expect(within(detail).getByText('Familial Connections')).toBeInTheDocument()
    })

    it('renders family supplier conflict alert', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Alice Pemberton').closest('.integrity-card-header')
      fireEvent.click(header)
      expect(screen.getByText(/Family member's company is a council supplier/)).toBeInTheDocument()
    })

    it('renders family member name and relationship', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Alice Pemberton').closest('.integrity-card-header')
      fireEvent.click(header)
      const detail = document.querySelector('.integrity-detail')
      expect(within(detail).getByText('John Pemberton')).toBeInTheDocument()
      expect(within(detail).getByText('spouse')).toBeInTheDocument()
    })

    it('renders family member supplier conflict details', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Alice Pemberton').closest('.integrity-card-header')
      fireEvent.click(header)
      expect(screen.getByText(/Pemberton Family Builders.*Pemberton Builders/)).toBeInTheDocument()
    })

    it('does not render familial section when no clusters exist', () => {
      const noFamilial = { ...richIntegrity, surname_clusters: [] }
      useData.mockReturnValue({ data: [noFamilial, richCouncillorsFull, null, null], loading: false, error: null })
      render(
        <MemoryRouter>
          <Integrity />
        </MemoryRouter>
      )
      expect(screen.queryByText('Familial Connection Analysis')).not.toBeInTheDocument()
    })
  })

  // ── Councillor card badges ──

  describe('councillor card badges', () => {
    it('renders Conflict badge for councillors with supplier conflicts', () => {
      renderWithRichData()
      const badges = document.querySelectorAll('.badge-conflict')
      expect(badges.length).toBeGreaterThan(0)
    })

    it('renders Cross-Council badge for councillors with cross-council conflicts', () => {
      renderWithRichData()
      const badges = document.querySelectorAll('.badge-cross-council')
      expect(badges.length).toBeGreaterThan(0)
    })

    it('renders Misconduct badge for councillors with misconduct patterns', () => {
      renderWithRichData()
      const badges = document.querySelectorAll('.badge-misconduct')
      expect(badges.length).toBeGreaterThan(0)
    })

    it('renders Family badge for councillors with family supplier conflict', () => {
      renderWithRichData()
      const badges = document.querySelectorAll('.badge-family')
      expect(badges.length).toBeGreaterThan(0)
    })

    it('renders Network badge for councillors needing network investigation', () => {
      renderWithRichData()
      const badges = document.querySelectorAll('.badge-network')
      expect(badges.length).toBeGreaterThan(0)
    })

    it('renders active directorship count badge', () => {
      renderWithRichData()
      const directorshipBadges = document.querySelectorAll('.badge-directorships')
      expect(directorshipBadges.length).toBeGreaterThan(0)
    })
  })

  // ── Network Crossover in expanded detail ──

  describe('network crossover in expanded detail', () => {
    it('renders network crossover section', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Alice Pemberton').closest('.integrity-card-header')
      fireEvent.click(header)
      const detail = document.querySelector('.integrity-detail')
      expect(within(detail).getByText(/Network Crossover/)).toBeInTheDocument()
    })

    it('renders crossover path steps', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Alice Pemberton').closest('.integrity-card-header')
      fireEvent.click(header)
      const crossoverSection = document.querySelector('.crossover-section')
      expect(within(crossoverSection).getByText('Shared Company')).toBeInTheDocument()
      expect(within(crossoverSection).getByText('Co-Director')).toBeInTheDocument()
      expect(within(crossoverSection).getByText('Also Directs')).toBeInTheDocument()
      expect(within(crossoverSection).getByText('Council Supplier')).toBeInTheDocument()
    })

    it('renders crossover severity and confidence', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Alice Pemberton').closest('.integrity-card-header')
      fireEvent.click(header)
      const crossoverSection = document.querySelector('.crossover-section')
      expect(within(crossoverSection).getByText('78% match')).toBeInTheDocument()
    })
  })

  // ── Clean councillor expanded view ──

  describe('clean councillor expanded view', () => {
    it('shows no issues message for clean councillor', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Naomi Fletcher').closest('.integrity-card-header')
      fireEvent.click(header)
      expect(screen.getByText(/No directorships, conflicts or red flags found/)).toBeInTheDocument()
    })

    it('shows last checked date for clean councillor', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Naomi Fletcher').closest('.integrity-card-header')
      fireEvent.click(header)
      expect(screen.getByText(/Last checked:/)).toBeInTheDocument()
    })
  })

  // ── Network Investigation Advisory (dashboard level) ──

  describe('network investigation advisory', () => {
    it('renders network investigation advisory section', () => {
      renderWithRichData()
      expect(screen.getByText('Network Investigation Advisable')).toBeInTheDocument()
    })

    it('lists network investigation candidate names', () => {
      renderWithRichData()
      // Alice (high risk + 3+ directorships + supplier conflict) and Diana (elevated + supplier conflict) should be candidates
      const chips = document.querySelectorAll('.network-candidate-chip')
      const names = [...chips].map(c => c.textContent)
      expect(names).toContain('Alice Pemberton')
      expect(names).toContain('Diana Greenwell')
    })
  })

  // ── Methodology Banner ──

  describe('methodology banner', () => {
    it('renders methodology banner', () => {
      renderWithRichData()
      expect(screen.getByText(/14-source forensic investigation/)).toBeInTheDocument()
    })

    it('shows register available message when register is available', () => {
      renderWithRichData()
      expect(screen.getByText(/Register of interests data is available/)).toBeInTheDocument()
    })

    it('shows register not available message when register is missing', () => {
      const noRegister = { ...richIntegrity, register_available: false }
      useData.mockReturnValue({ data: [noRegister, richCouncillorsFull, null, null], loading: false, error: null })
      render(
        <MemoryRouter>
          <Integrity />
        </MemoryRouter>
      )
      expect(screen.getByText(/Register of interests is not available/)).toBeInTheDocument()
    })
  })

  // ── Community conflict type badge ──

  describe('conflict type classification', () => {
    it('renders community/charity conflict type badge in expanded detail', () => {
      renderWithRichData()
      const grid = getCardsSection()
      const header = within(grid).getByText('Diana Greenwell').closest('.integrity-card-header')
      fireEvent.click(header)
      const detail = document.querySelector('.integrity-detail')
      expect(within(detail).getByText('Community/Charity')).toBeInTheDocument()
    })
  })

  // ── v4: Tab Navigation ──

  describe('v4 tab navigation', () => {
    it('renders Councillors tab by default', () => {
      renderWithRichData()
      const tab = screen.getByRole('tab', { name: /Councillors/i })
      expect(tab).toBeInTheDocument()
      expect(tab).toHaveAttribute('aria-selected', 'true')
    })

    it('renders MPs tab when MP interests data is available', () => {
      const mpInterests = {
        constituencies: {
          burnley: {
            mp_name: 'Oliver Ryan',
            mp_party: 'Labour (Co-op)',
            total_interests: 5,
            companies_declared: ['Ryan Corp'],
            donors: ['Big Donor Co'],
            supplier_findings: [],
            ch_cross_reference: [],
          }
        }
      }
      useData.mockReturnValue({
        data: [richIntegrity, richCouncillorsFull, mpInterests, null],
        loading: false, error: null,
      })
      render(<MemoryRouter><Integrity /></MemoryRouter>)
      const tab = screen.getByRole('tab', { name: /MPs/i })
      expect(tab).toBeInTheDocument()
    })

    it('renders Investigation Priorities tab when cross-council data has priorities', () => {
      const crossCouncil = {
        investigation_priorities: [
          {
            councillor: 'Suspect Councillor',
            council: 'burnley',
            risk_level: 'high',
            integrity_score: 20,
            critical_flags: 3,
            total_flags: 8,
            network_centrality: 0.9,
            priority_score: 34.5,
            top_concerns: ['Supplier conflict with hidden ownership'],
          }
        ]
      }
      useData.mockReturnValue({
        data: [richIntegrity, richCouncillorsFull, null, crossCouncil],
        loading: false, error: null,
      })
      render(<MemoryRouter><Integrity /></MemoryRouter>)
      const tab = screen.getByRole('tab', { name: /Investigation Priorities/i })
      expect(tab).toBeInTheDocument()
    })

    it('switches to MPs tab on click and shows MP section', () => {
      const mpInterests = {
        constituencies: {
          burnley: {
            mp_name: 'Oliver Ryan',
            mp_party: 'Labour',
            total_interests: 3,
            companies_declared: [],
            donors: [],
            supplier_findings: [],
            ch_cross_reference: [],
          }
        }
      }
      useData.mockReturnValue({
        data: [richIntegrity, richCouncillorsFull, mpInterests, null],
        loading: false, error: null,
      })
      render(<MemoryRouter><Integrity /></MemoryRouter>)
      fireEvent.click(screen.getByRole('tab', { name: /MPs/i }))
      expect(screen.getByText('Oliver Ryan')).toBeInTheDocument()
      expect(document.querySelector('.integrity-mp-section')).toBeInTheDocument()
    })
  })

  // ── v4: Dashboard stat cards ──

  describe('v4 dashboard stats', () => {
    it('renders MP financial links stat when present', () => {
      const v4Integrity = {
        ...richIntegrity,
        version: '4.0',
        summary: { ...richIntegrity.summary, mp_financial_links: 3 },
      }
      useData.mockReturnValue({
        data: [v4Integrity, richCouncillorsFull, null, null],
        loading: false, error: null,
      })
      render(<MemoryRouter><Integrity /></MemoryRouter>)
      expect(screen.getByText('MP Financial Links')).toBeInTheDocument()
    })

    it('renders revolving door stat when present', () => {
      const v4Integrity = {
        ...richIntegrity,
        version: '4.0',
        summary: { ...richIntegrity.summary, revolving_door_detections: 2 },
      }
      useData.mockReturnValue({
        data: [v4Integrity, richCouncillorsFull, null, null],
        loading: false, error: null,
      })
      render(<MemoryRouter><Integrity /></MemoryRouter>)
      expect(screen.getByText('Revolving Door')).toBeInTheDocument()
    })
  })

  // ── v4: Councillor expanded v4 sections ──

  describe('v4 councillor detail sections', () => {
    it('renders MP financial connections in expanded detail', () => {
      const v4Councillors = richIntegrity.councillors.map(c => ({
        ...c,
        mp_findings: c.councillor_id === 'c1' ? [{
          type: 'mp_shared_company', severity: 'critical',
          detail: 'Councillor company matches MP declared employer',
        }] : [],
      }))
      const v4Integrity = { ...richIntegrity, councillors: v4Councillors }
      useData.mockReturnValue({
        data: [v4Integrity, richCouncillorsFull, null, null],
        loading: false, error: null,
      })
      render(<MemoryRouter><Integrity /></MemoryRouter>)
      // Find the card header by role="button" containing Alice
      const headers = screen.getAllByRole('button').filter(
        el => el.classList.contains('integrity-card-header') && el.textContent.includes('Alice Pemberton')
      )
      expect(headers.length).toBeGreaterThan(0)
      fireEvent.click(headers[0])
      expect(screen.getByText('MP Financial Connections')).toBeInTheDocument()
      expect(screen.getByText(/Councillor company matches MP declared employer/)).toBeInTheDocument()
    })

    it('renders network centrality meter in expanded detail', () => {
      const v4Councillors = richIntegrity.councillors.map(c => ({
        ...c,
        network_centrality: c.councillor_id === 'c1' ? {
          score: 0.75, amplifier: 1.3, raw_score: 15, max_in_council: 20,
          components: { companies: 4, associates: 8, cross_council_links: 1, supplier_conflicts: 2, mp_connections: 0 },
        } : null,
      }))
      const v4Integrity = { ...richIntegrity, councillors: v4Councillors }
      useData.mockReturnValue({
        data: [v4Integrity, richCouncillorsFull, null, null],
        loading: false, error: null,
      })
      render(<MemoryRouter><Integrity /></MemoryRouter>)
      const headers = screen.getAllByRole('button').filter(
        el => el.classList.contains('integrity-card-header') && el.textContent.includes('Alice Pemberton')
      )
      expect(headers.length).toBeGreaterThan(0)
      fireEvent.click(headers[0])
      expect(screen.getByText('Network Centrality')).toBeInTheDocument()
      expect(screen.getByText(/Highly connected/)).toBeInTheDocument()
    })
  })
})
