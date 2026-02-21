import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DogeInvestigation from './DogeInvestigation'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="chart">{children}</div>,
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  PieChart: () => null,
  Pie: () => null,
  Cell: () => null,
  RadarChart: () => null,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null,
  Radar: () => null,
  ScatterChart: () => null,
  Scatter: () => null,
  ZAxis: () => null,
  Legend: () => null,
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'

// --- Mock data ---
const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
  data_sources: { foi: true, meetings: true },
  doge_context: { population: 90000 },
}

const mockFindings = {
  findings: [
    { id: 'F1', severity: 'critical', value: '£120K', label: 'CH breach spend', detail: 'Payments to non-compliant companies', link: '/spending?filter=ch_breach', confidence: 'high', statistics: { n: 150, chi_squared: 12.4, df: 3, significant: true }, context_note: 'Based on verified Companies House data' },
    { id: 'F2', severity: 'warning', value: '£45K', label: 'Split payment patterns', detail: '12 suspected split payments', link: '/spending', confidence: 'medium' },
    { id: 'F3', severity: 'info', value: '1.15x', label: 'Year-end ratio', detail: 'March spending vs average' },
  ],
  key_findings: [
    { title: 'Recurring supplier concern', description: 'Supplier XYZ Ltd received 23 payments in 7 days', severity: 'warning', badge: 'ALERT', confidence: 'medium', link: '/spending?supplier=XYZ', link_text: 'View evidence →', context_note: 'May be legitimate batch processing' },
    { title: 'Round number pattern', description: '15% of payments are exact round numbers', severity: 'info', badge: 'PATTERN', link: '/spending' },
  ],
  analyses_run: ['duplicates', 'splits', 'ch_compliance', 'benfords', 'cross_council', 'payment_velocity'],
  generated: '2025-01-15T10:30:00Z',
  payment_velocity: {
    total_analysed: 500,
    rapid_payers: [
      { supplier: 'ACME SERVICES LTD', payments: 45, avg_days: 7, total_spend: 120000 },
      { supplier: 'QUICK PAY CORP', payments: 30, avg_days: 10, total_spend: 85000 },
    ],
    regular_payers: [
      { supplier: 'MONTHLY SERVICES INC', payments: 24, avg_days: 30, std_dev: 2, total_spend: 60000 },
    ],
    day_of_week: [
      { day: 'Monday', count: 1200 },
      { day: 'Tuesday', count: 1500 },
      { day: 'Wednesday', count: 1400 },
      { day: 'Thursday', count: 1300 },
      { day: 'Friday', count: 900 },
    ],
  },
  supplier_concentration: {
    hhi: 2800,
    concentration_level: 'high',
    unique_suppliers: 3000,
    top10_pct: '45',
    top5: {
      pct: '32',
      total: 48000000,
      suppliers: [
        { supplier: 'BIG CONTRACTOR LTD', count: 200, total: 20000000, pct: '13.3' },
        { supplier: 'SERVICES UNLIMITED', count: 150, total: 12000000, pct: '8.0' },
      ],
    },
  },
  procurement_compliance: {
    awarded_contracts: 85,
    threshold_suspect_count: 5,
    repeat_winner_count: 3,
    transparency_gap: { pct: '22' },
    timing_cluster_count: 2,
    late_publication_count: 8,
    weak_competition_count: 4,
    monopoly_category_count: 2,
    publication_timing: { avg_delay_days: 45, median_delay_days: 30 },
    threshold_suspects: [
      { title: 'IT Support Contract', value: 28500, threshold_label: '£30K', pct_of_threshold: '95' },
    ],
    repeat_winners: [
      { supplier: 'REPEAT WINNER CO', contracts: 5, total_value: 250000, avg_value: 50000 },
    ],
    late_publications: [
      { title: 'Waste Collection Services', supplier: 'WASTE CO', awarded_date: '2024-03-01', published_date: '2024-06-15', days_late: 106, awarded_value: 150000 },
    ],
    weak_competition: [
      { title: 'Security Services', supplier: 'GUARD LTD', awarded_value: 80000, flags: ['Short tender period', 'Rapid award'] },
    ],
    monopoly_categories: [
      { cpv: 'Building cleaning services', supplier: 'CLEAN ALL LTD', contracts: 3, total_value: 95000 },
    ],
  },
  fraud_triangle: {
    overall_score: 68,
    risk_level: 'elevated',
    total_signals: 12,
    dimensions: {
      opportunity: { score: 72, signals: [{ signal: 'High supplier concentration' }, { signal: 'Weak procurement controls' }] },
      pressure: { score: 55, signals: [{ signal: 'Budget cuts 3 consecutive years' }] },
      rationalization: { score: 45, signals: [] },
    },
  },
}

const mockInsights = {
  summary: { total_spend: 150000000, transaction_count: 25000, unique_suppliers: 3000 },
}

const mockVerification = {
  score: 85,
  checks: [
    { label: 'Date validation', detail: 'All dates within expected range', status: 'pass' },
    { label: 'Amount cross-check', detail: 'Totals reconcile with published accounts', status: 'pass' },
    { label: 'Supplier matching', detail: 'Some names could not be matched to CH', status: 'warning' },
  ],
  warnings: ['Sample size for Benford analysis below recommended threshold', 'Cross-council data incomplete for 2 councils'],
  passed: 2,
  total_checks: 3,
}

const mockLegalFramework = [
  { title: 'Transparency Code 2015', category: 'transparency', summary: 'Requires publication of spending over £500', relevance: 'Core legal basis for this investigation', signals: ['Missing data', 'Late publication'], url: 'https://legislation.gov.uk/tc2015' },
  { title: 'Public Contract Regulations 2015', category: 'procurement', summary: 'Sets procurement thresholds', relevance: 'Split payment detection', signals: ['Threshold avoidance'] },
  { title: 'Companies Act 2006', category: 'compliance', summary: 'Director and filing requirements', relevance: 'CH compliance checks' },
]

const mockOutcomes = {
  outcomes: [
    { id: 'O1', status: 'resolved', date: '2025-02-01', finding: 'Missing supplier data', response: 'Council updated records', next_steps: ['Verify update in Q2'] },
    { id: 'O2', status: 'monitoring', date: '2025-01-20', finding: 'Late contract publication', response: 'Under review', next_steps: [] },
    { id: 'O3', status: 'open', date: '2025-01-10', finding: 'Round number anomaly', response: 'FOI submitted', next_steps: ['Chase response', 'Escalate if no reply by March'] },
  ],
  summary: { total_findings_published: 15, council_responses_received: 3, policy_changes_tracked: 1, foi_requests_submitted: 5 },
}

const mockDogeKnowledge = {
  council_profile: { population: 90000, tier: 'district' },
  data_quality: { overall_score: 78, date_completeness: '95', department_completeness: '88', description_completeness: '42', ch_match_rate: '65' },
  verified_findings: {
    ch_breach_spend: { value: '£120K', confidence: 'high', suppliers: 5, note: 'Verified via Companies House API', top_cases: [{ supplier: 'DODGY LTD', spend: '£45,000', issue: 'No active directors since 2023' }, { name: 'LATE FILER CO', amount: '£30,000', note: 'Accounts overdue 18 months' }] },
    transparency_gap: { value: '42%', note: 'Description field completeness is 42%, well below the 80% benchmark' },
    split_payments: { value: '£45K', confidence: 'medium', instances: 12, note: 'All below £5,000 threshold' },
    year_end_pattern: { value: '1.8x', confidence: 'high', note: 'March spending 80% above monthly average', public_interest: 'Pattern consistent across multiple years' },
  },
  cross_council_context: {
    shared_suppliers: 45,
    combined_spend: '£2.1M',
    price_gap_example: { supplier: 'UTILITY CO', disparity: '38% higher' },
  },
}

// Helper to set up mocks — uses mockImplementation to handle multiple useData calls
function setupMocks(overrides = {}) {
  useCouncilConfig.mockReturnValue(overrides.config || mockConfig)

  const mainData = overrides.mainData !== undefined ? overrides.mainData : [
    mockFindings, mockInsights, mockVerification, mockLegalFramework, mockOutcomes,
  ]
  const knowledgeData = overrides.knowledgeData !== undefined ? overrides.knowledgeData : mockDogeKnowledge

  useData.mockImplementation((urls) => {
    if (overrides.loading) return { data: null, loading: true, error: null }
    if (overrides.error) return { data: null, loading: false, error: overrides.error }
    // Single URL = doge_knowledge.json
    if (typeof urls === 'string' && urls.includes('doge_knowledge')) {
      return { data: knowledgeData, loading: false, error: null }
    }
    // Array = main data
    if (Array.isArray(urls)) {
      return { data: mainData, loading: false, error: null }
    }
    return { data: null, loading: false, error: null }
  })
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <DogeInvestigation />
    </MemoryRouter>
  )
}

describe('DogeInvestigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // --- Loading & Error States ---
  describe('Loading & Error States', () => {
    it('shows loading state while data loads', () => {
      setupMocks({ loading: true })
      renderComponent()
      expect(screen.getByText(/loading investigation data/i)).toBeInTheDocument()
    })

    it('shows error state when data fails to load', () => {
      setupMocks({ error: new Error('Network error') })
      renderComponent()
      expect(screen.getByText(/unable to load investigation data/i)).toBeInTheDocument()
      expect(screen.getByText(/please try refreshing/i)).toBeInTheDocument()
    })

    it('shows unavailable message when dogeFindings is null', () => {
      setupMocks({ mainData: [null, null, null, null, null] })
      renderComponent()
      expect(screen.getByText(/investigation data is not yet available/i)).toBeInTheDocument()
      expect(screen.getByText(/Burnley/)).toBeInTheDocument()
    })

    it('shows unavailable message when data array is null', () => {
      useCouncilConfig.mockReturnValue(mockConfig)
      useData.mockImplementation((urls) => {
        if (typeof urls === 'string') return { data: null, loading: false, error: null }
        return { data: null, loading: false, error: null }
      })
      renderComponent()
      expect(screen.getByText(/investigation data is not yet available/i)).toBeInTheDocument()
    })
  })

  // --- Hero Section ---
  describe('Hero Section', () => {
    it('renders the page heading with council name', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/DOGE Investigation: Burnley/)).toBeInTheDocument()
    })

    it('displays hero stats with correct values', () => {
      setupMocks()
      renderComponent()
      const hero = document.querySelector('.doge-hero-stats')
      // Total findings = findings.length + keyFindings.length = 3 + 2 = 5
      expect(within(hero).getByText('5')).toBeInTheDocument()
      // Analyses run = 6
      expect(within(hero).getByText('6')).toBeInTheDocument()
      // Checks passed: 2/3
      expect(within(hero).getByText('2/3')).toBeInTheDocument()
      // Verification score
      expect(within(hero).getByText('85')).toBeInTheDocument()
    })

    it('displays hero subtitle with formatted spend', () => {
      setupMocks()
      renderComponent()
      const subtitle = document.querySelector('.doge-hero-subtitle')
      expect(subtitle).toBeTruthy()
      // formatCurrency(150000000, true) → £150M. Text may contain the formatted values
      expect(subtitle.textContent).toMatch(/150/)
      expect(subtitle.textContent).toMatch(/25,000/)
      expect(subtitle.textContent).toMatch(/3,000/)
    })

    it('shows AI-Powered Public Scrutiny badge', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/AI-Powered Public Scrutiny/)).toBeInTheDocument()
    })
  })

  // --- Methodology Banner ---
  describe('Methodology Banner', () => {
    it('displays methodology explanation', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/How this works/)).toBeInTheDocument()
      expect(screen.getByText(/automated checks/i)).toBeInTheDocument()
    })

    it('includes link to about page', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Learn more about our methodology/)).toBeInTheDocument()
    })

    it('shows limited data warning for small datasets', () => {
      const smallInsights = { summary: { total_spend: 5000000, transaction_count: 2000, unique_suppliers: 500 } }
      setupMocks({ mainData: [mockFindings, smallInsights, mockVerification, mockLegalFramework, mockOutcomes] })
      renderComponent()
      expect(screen.getByText(/Limited dataset/)).toBeInTheDocument()
      // "2,000" appears in multiple elements so use getAllByText
      expect(screen.getAllByText(/2,000/).length).toBeGreaterThan(0)
    })

    it('does not show limited data warning for large datasets', () => {
      setupMocks()
      renderComponent()
      expect(screen.queryByText(/Limited dataset/)).not.toBeInTheDocument()
    })
  })

  // --- Key Findings Section ---
  describe('Key Findings Cards', () => {
    it('renders all finding cards', () => {
      setupMocks()
      renderComponent()
      const findingsSection = document.querySelector('[aria-label="Key findings"]')
      expect(within(findingsSection).getByText('£120K')).toBeInTheDocument()
      expect(within(findingsSection).getByText('£45K')).toBeInTheDocument()
      expect(within(findingsSection).getByText('1.15x')).toBeInTheDocument()
    })

    it('displays finding labels and details', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('CH breach spend')).toBeInTheDocument()
      expect(screen.getByText('Split payment patterns')).toBeInTheDocument()
      expect(screen.getByText(/Payments to non-compliant/)).toBeInTheDocument()
    })

    it('shows confidence badges where present', () => {
      setupMocks()
      renderComponent()
      expect(screen.getAllByText('High Confidence').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Medium Confidence').length).toBeGreaterThan(0)
    })

    it('renders statistical annotations when present', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/n=150/)).toBeInTheDocument()
      expect(screen.getByText(/χ²=12.4/)).toBeInTheDocument()
      expect(screen.getByText(/● Significant/)).toBeInTheDocument()
    })

    it('renders context notes when present', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Based on verified Companies House data/)).toBeInTheDocument()
    })

    it('creates evidence links with ref=doge', () => {
      setupMocks()
      renderComponent()
      const links = screen.getAllByRole('link')
      const evidenceLinks = links.filter(l => l.getAttribute('href')?.includes('ref=doge'))
      expect(evidenceLinks.length).toBeGreaterThan(0)
    })

    it('appends ref=doge correctly to links with existing params', () => {
      setupMocks()
      renderComponent()
      const links = screen.getAllByRole('link')
      const chLink = links.find(l => l.getAttribute('href')?.includes('filter=ch_breach'))
      expect(chLink?.getAttribute('href')).toContain('&ref=doge')
    })
  })

  // --- Detailed Analysis: Companies House Compliance ---
  describe('Companies House Compliance Section', () => {
    it('renders CH compliance expandable section', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Companies House Compliance')).toBeInTheDocument()
    })

    it('shows supplier count in CH section', () => {
      setupMocks()
      renderComponent()
      // defaultOpen={true} so content is visible
      expect(screen.getByText(/5 suppliers/)).toBeInTheDocument()
    })

    it('renders top cases table', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Highest-Risk Suppliers')).toBeInTheDocument()
      expect(screen.getByText('DODGY LTD')).toBeInTheDocument()
      expect(screen.getByText('LATE FILER CO')).toBeInTheDocument()
    })

    it('shows verification checks for CH section', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Temporal cross-reference')).toBeInTheDocument()
    })
  })

  // --- Detailed Analysis: Transparency Gap ---
  describe('Transparency & Data Quality Section', () => {
    it('renders transparency section when data present', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Transparency & Data Quality')).toBeInTheDocument()
    })

    it('shows data quality radar chart when quality data present', () => {
      setupMocks()
      renderComponent()
      // Section is not defaultOpen, need to click to expand
      const btn = screen.getByText('Transparency & Data Quality').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText('Data Quality Breakdown')).toBeInTheDocument()
    })
  })

  // --- Detailed Analysis: Split Payments ---
  describe('Split Payments Section', () => {
    it('renders split payments section', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Suspected Split Payments')).toBeInTheDocument()
    })

    it('shows instance count on expand', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Suspected Split Payments').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText(/12 instances/)).toBeInTheDocument()
    })

    it('shows split payment verification checks', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Suspected Split Payments').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText('Threshold analysis')).toBeInTheDocument()
      expect(screen.getByText(/False positive risk/)).toBeInTheDocument()
    })
  })

  // --- Detailed Analysis: Year-End Pattern ---
  describe('Year-End Spending Pattern Section', () => {
    it('renders year-end pattern section', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Year-End Spending Patterns')).toBeInTheDocument()
    })

    it('shows public interest note on expand', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Year-End Spending Patterns').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText(/Pattern consistent across multiple years/)).toBeInTheDocument()
    })
  })

  // --- Detailed Analysis: Payment Velocity ---
  describe('Payment Velocity Section', () => {
    it('renders payment velocity section', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Payment Velocity Analysis')).toBeInTheDocument()
    })

    it('shows rapid payers table on expand', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Payment Velocity Analysis').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText(/Rapid Payment Suppliers/)).toBeInTheDocument()
      expect(screen.getByText('ACME SERVICES LTD')).toBeInTheDocument()
      expect(screen.getByText('QUICK PAY CORP')).toBeInTheDocument()
    })

    it('shows regular payers table on expand', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Payment Velocity Analysis').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText(/Clock-Like Regular Payers/)).toBeInTheDocument()
      expect(screen.getByText('MONTHLY SERVICES INC')).toBeInTheDocument()
    })

    it('shows day of week chart on expand', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Payment Velocity Analysis').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText('Payments by Day of Week')).toBeInTheDocument()
    })
  })

  // --- Detailed Analysis: Supplier Concentration ---
  describe('Supplier Concentration Section', () => {
    it('renders supplier concentration section with HHI', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Supplier Concentration')).toBeInTheDocument()
    })

    it('shows top 5 suppliers table on expand', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Supplier Concentration').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText(/Top 5 Suppliers/)).toBeInTheDocument()
      expect(screen.getByText('BIG CONTRACTOR LTD')).toBeInTheDocument()
      expect(screen.getByText('SERVICES UNLIMITED')).toBeInTheDocument()
    })

    it('shows concentration description', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Supplier Concentration').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText(/highly concentrated market/)).toBeInTheDocument()
    })
  })

  // --- Detailed Analysis: Procurement Compliance ---
  describe('Procurement Compliance Section', () => {
    it('renders procurement compliance section', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Procurement Compliance')).toBeInTheDocument()
    })

    it('shows procurement stats on expand', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Procurement Compliance').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText('Threshold Suspects')).toBeInTheDocument()
      expect(screen.getByText('Repeat Winners')).toBeInTheDocument()
      expect(screen.getByText('Late Publications')).toBeInTheDocument()
      expect(screen.getByText('Weak Competition')).toBeInTheDocument()
    })

    it('shows threshold suspects table', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Procurement Compliance').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText(/Contracts Near Procurement Thresholds/)).toBeInTheDocument()
      expect(screen.getByText('IT Support Contract')).toBeInTheDocument()
    })

    it('shows repeat winners table', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Procurement Compliance').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText(/Repeat Contract Winners/)).toBeInTheDocument()
      expect(screen.getByText('REPEAT WINNER CO')).toBeInTheDocument()
    })

    it('shows late publications table', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Procurement Compliance').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText(/Late Contract Publications/)).toBeInTheDocument()
      expect(screen.getByText('WASTE CO')).toBeInTheDocument()
    })

    it('shows weak competition table', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Procurement Compliance').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText(/Weak Competition Indicators/)).toBeInTheDocument()
      expect(screen.getByText('GUARD LTD')).toBeInTheDocument()
    })

    it('shows monopoly categories table', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Procurement Compliance').closest('button')
      fireEvent.click(btn)
      // "Category Monopolies" heading exists plus monopoly_category_count stat label
      expect(screen.getAllByText(/Category Monopolies/).length).toBeGreaterThan(0)
      expect(screen.getByText('CLEAN ALL LTD')).toBeInTheDocument()
    })

    it('shows publication timing stats', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText('Procurement Compliance').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText(/45 days/)).toBeInTheDocument()
      expect(screen.getByText(/Avg Publication Delay/)).toBeInTheDocument()
    })
  })

  // --- Fraud Triangle Section ---
  describe('Fraud Triangle Section', () => {
    it('renders fraud triangle section', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Risk Assessment: Fraud Triangle/)).toBeInTheDocument()
    })

    it('shows overall score and risk level on expand', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText(/Risk Assessment: Fraud Triangle/).closest('button')
      fireEvent.click(btn)
      expect(screen.getByText(/68\/100/)).toBeInTheDocument()
    })

    it('shows three dimensions with scores', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText(/Risk Assessment: Fraud Triangle/).closest('button')
      fireEvent.click(btn)
      // "Opportunity" appears in signals too, use getAllByText
      expect(screen.getAllByText(/Opportunity/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Pressure/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Rationalization/).length).toBeGreaterThan(0)
      expect(screen.getByText('72/100')).toBeInTheDocument()
      expect(screen.getByText('55/100')).toBeInTheDocument()
      expect(screen.getByText('45/100')).toBeInTheDocument()
    })

    it('shows dimension signals', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText(/Risk Assessment: Fraud Triangle/).closest('button')
      fireEvent.click(btn)
      expect(screen.getByText('High supplier concentration')).toBeInTheDocument()
      expect(screen.getByText('Weak procurement controls')).toBeInTheDocument()
      expect(screen.getByText('Budget cuts 3 consecutive years')).toBeInTheDocument()
    })

    it('shows no signals message for empty dimension', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText(/Risk Assessment: Fraud Triangle/).closest('button')
      fireEvent.click(btn)
      expect(screen.getByText(/No signals detected in this dimension/)).toBeInTheDocument()
    })

    it('shows fraud triangle radar chart', () => {
      setupMocks()
      renderComponent()
      const btn = screen.getByText(/Risk Assessment: Fraud Triangle/).closest('button')
      fireEvent.click(btn)
      expect(screen.getByText('Risk Dimensions')).toBeInTheDocument()
    })
  })

  // --- Cross-Council Section ---
  describe('Cross-Council Intelligence Section', () => {
    it('renders cross-council section when data present', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Cross-Council Intelligence')).toBeInTheDocument()
    })

    it('shows shared supplier stats', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('45')).toBeInTheDocument()
      expect(screen.getByText('Shared Suppliers')).toBeInTheDocument()
      expect(screen.getByText('£2.1M')).toBeInTheDocument()
    })

    it('shows price gap example', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('38% higher')).toBeInTheDocument()
      expect(screen.getByText(/Worst Price Gap/)).toBeInTheDocument()
    })

    it('includes link to compare page', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/View full cross-council comparison/)).toBeInTheDocument()
    })

    it('does not render when cross-council data absent', () => {
      setupMocks({ knowledgeData: null })
      renderComponent()
      expect(screen.queryByText('Cross-Council Intelligence')).not.toBeInTheDocument()
    })
  })

  // --- Investigation Highlights ---
  describe('Investigation Highlights', () => {
    it('renders key findings cards', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Investigation Highlights')).toBeInTheDocument()
      expect(screen.getByText('Recurring supplier concern')).toBeInTheDocument()
      expect(screen.getByText('Round number pattern')).toBeInTheDocument()
    })

    it('shows badge on key finding cards', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('ALERT')).toBeInTheDocument()
      expect(screen.getByText('PATTERN')).toBeInTheDocument()
    })

    it('shows context note on key findings', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/May be legitimate batch processing/)).toBeInTheDocument()
    })

    it('shows custom link text', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('View evidence →')).toBeInTheDocument()
      // Default link text
      expect(screen.getByText('Investigate →')).toBeInTheDocument()
    })

    it('does not render highlights section when empty', () => {
      const noKeyFindings = { ...mockFindings, key_findings: [] }
      setupMocks({ mainData: [noKeyFindings, mockInsights, mockVerification, mockLegalFramework, mockOutcomes] })
      renderComponent()
      expect(screen.queryByText('Investigation Highlights')).not.toBeInTheDocument()
    })
  })

  // --- Outcomes / What Changed Section ---
  describe('What Changed Section', () => {
    it('renders outcomes section when data present', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('What Changed?')).toBeInTheDocument()
    })

    it('shows outcome cards with status', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Missing supplier data')).toBeInTheDocument()
      expect(screen.getByText('Late contract publication')).toBeInTheDocument()
      expect(screen.getByText('Round number anomaly')).toBeInTheDocument()
    })

    it('shows outcome responses', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Council updated records')).toBeInTheDocument()
      expect(screen.getByText('FOI submitted')).toBeInTheDocument()
    })

    it('shows next steps for outcomes that have them', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Verify update in Q2')).toBeInTheDocument()
      expect(screen.getByText('Chase response')).toBeInTheDocument()
    })

    it('shows outcomes summary stats', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('15')).toBeInTheDocument()
      expect(screen.getByText('Findings Published')).toBeInTheDocument()
      expect(screen.getByText('Council Responses')).toBeInTheDocument()
      expect(screen.getByText('Policy Changes')).toBeInTheDocument()
      expect(screen.getByText('FOI Requests')).toBeInTheDocument()
    })

    it('shows council response count in intro', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/3 council response\(s\) received/)).toBeInTheDocument()
    })

    it('does not render outcomes section when no outcomes', () => {
      setupMocks({ mainData: [mockFindings, mockInsights, mockVerification, mockLegalFramework, null] })
      renderComponent()
      expect(screen.queryByText('What Changed?')).not.toBeInTheDocument()
    })
  })

  // --- Verification Section ---
  describe('Analysis Verification Section', () => {
    it('renders verification section', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Analysis Verification')).toBeInTheDocument()
    })

    it('shows automated verification checks', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Date validation')).toBeInTheDocument()
      expect(screen.getByText('Amount cross-check')).toBeInTheDocument()
      expect(screen.getByText('Supplier matching')).toBeInTheDocument()
    })

    it('shows self-challenges when warnings present', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Self-Challenges')).toBeInTheDocument()
      expect(screen.getByText(/Sample size for Benford/)).toBeInTheDocument()
      expect(screen.getByText(/Cross-council data incomplete/)).toBeInTheDocument()
    })

    it('shows verification methodology cards', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Our Verification Framework')).toBeInTheDocument()
      expect(screen.getByText('Temporal Logic')).toBeInTheDocument()
      expect(screen.getByText('Confidence Scoring')).toBeInTheDocument()
      expect(screen.getByText('Cross-Validation')).toBeInTheDocument()
      expect(screen.getByText('Limitation Disclosure')).toBeInTheDocument()
    })

    it('falls back to knowledge-based checks when automated checks empty', () => {
      const noAutoChecks = { score: 85, checks: [], warnings: [], passed: 0, total_checks: 0 }
      setupMocks({ mainData: [mockFindings, mockInsights, noAutoChecks, mockLegalFramework, mockOutcomes] })
      renderComponent()
      // Should show fallback checks from knowledge data
      expect(screen.getByText(/Companies House breach temporal verification/)).toBeInTheDocument()
      expect(screen.getByText(/Split payment threshold analysis/)).toBeInTheDocument()
      expect(screen.getByText(/6 analysis pipelines executed/)).toBeInTheDocument()
    })
  })

  // --- Legal Framework Section ---
  describe('Legal Framework Section', () => {
    it('renders legal framework section', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Legal Framework')).toBeInTheDocument()
    })

    it('shows legal cards from framework data', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Transparency Code 2015')).toBeInTheDocument()
      expect(screen.getByText('Public Contract Regulations 2015')).toBeInTheDocument()
      expect(screen.getByText('Companies Act 2006')).toBeInTheDocument()
    })

    it('shows detection signals on legal cards', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Missing data')).toBeInTheDocument()
      expect(screen.getByText('Late publication')).toBeInTheDocument()
    })

    it('shows legislation link when URL present', () => {
      setupMocks()
      renderComponent()
      const legLinks = screen.getAllByText(/View legislation/)
      expect(legLinks.length).toBeGreaterThan(0)
    })

    it('shows law count in intro text', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/3 laws and regulations/)).toBeInTheDocument()
    })

    it('shows fallback legal cards when framework is empty', () => {
      setupMocks({ mainData: [mockFindings, mockInsights, mockVerification, [], mockOutcomes] })
      renderComponent()
      // Fallback hardcoded cards should appear
      expect(screen.getByText(/Requires councils to publish spending over £500/)).toBeInTheDocument()
    })
  })

  // --- Take Action Section ---
  describe('Take Action Section', () => {
    it('renders take action section', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Take Action')).toBeInTheDocument()
    })

    it('shows search the data link', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Search the Data')).toBeInTheDocument()
    })

    it('shows FOI link when foi data source enabled', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Submit an FOI')).toBeInTheDocument()
    })

    it('shows meetings link when meetings data source enabled', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Attend a Meeting')).toBeInTheDocument()
    })

    it('hides FOI link when foi data source disabled', () => {
      const noFoiConfig = { ...mockConfig, data_sources: { meetings: true } }
      setupMocks({ config: noFoiConfig })
      renderComponent()
      expect(screen.queryByText('Submit an FOI')).not.toBeInTheDocument()
    })

    it('hides meetings link when meetings data source disabled', () => {
      const noMeetingsConfig = { ...mockConfig, data_sources: { foi: true } }
      setupMocks({ config: noMeetingsConfig })
      renderComponent()
      expect(screen.queryByText('Attend a Meeting')).not.toBeInTheDocument()
    })

    it('shows compare councils link', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Compare Councils')).toBeInTheDocument()
    })
  })

  // --- Footer Disclaimer ---
  describe('Footer Disclaimer', () => {
    it('shows disclaimer text', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/generated algorithmically from publicly available data/)).toBeInTheDocument()
    })

    it('includes link to legal page', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Full legal disclaimer')).toBeInTheDocument()
    })
  })

  // --- ExpandableSection behavior ---
  describe('ExpandableSection interaction', () => {
    it('toggles content on click', () => {
      setupMocks()
      renderComponent()
      // Split payments is not defaultOpen
      expect(screen.queryByText(/12 instances/)).not.toBeInTheDocument()
      const btn = screen.getByText('Suspected Split Payments').closest('button')
      fireEvent.click(btn)
      expect(screen.getByText(/12 instances/)).toBeInTheDocument()
      // Click again to close
      fireEvent.click(btn)
      expect(screen.queryByText(/12 instances/)).not.toBeInTheDocument()
    })

    it('CH compliance section is open by default', () => {
      setupMocks()
      renderComponent()
      // defaultOpen={true} so should be visible without clicking
      expect(screen.getByText('Highest-Risk Suppliers')).toBeInTheDocument()
    })
  })

  // --- Edge Cases ---
  describe('Edge Cases', () => {
    it('handles missing insights gracefully', () => {
      setupMocks({ mainData: [mockFindings, null, mockVerification, mockLegalFramework, mockOutcomes] })
      renderComponent()
      // Should still render — totalSpend/totalRecords default to 0
      expect(screen.getByText(/DOGE Investigation: Burnley/)).toBeInTheDocument()
    })

    it('handles empty findings array', () => {
      const emptyFindings = { ...mockFindings, findings: [], key_findings: [] }
      setupMocks({ mainData: [emptyFindings, mockInsights, mockVerification, mockLegalFramework, mockOutcomes] })
      renderComponent()
      expect(screen.getByText('0')).toBeInTheDocument() // 0 findings
    })

    it('handles missing verification data', () => {
      setupMocks({ mainData: [mockFindings, mockInsights, null, mockLegalFramework, mockOutcomes] })
      renderComponent()
      expect(screen.getByText(/DOGE Investigation: Burnley/)).toBeInTheDocument()
    })

    it('uses doge_context as fallback when no doge_knowledge', () => {
      setupMocks({ knowledgeData: null })
      renderComponent()
      // Should still render — uses config.doge_context as fallback profile
      expect(screen.getByText(/DOGE Investigation: Burnley/)).toBeInTheDocument()
    })

    it('handles no payment velocity data', () => {
      const noPV = { ...mockFindings, payment_velocity: undefined }
      setupMocks({ mainData: [noPV, mockInsights, mockVerification, mockLegalFramework, mockOutcomes] })
      renderComponent()
      expect(screen.queryByText('Payment Velocity Analysis')).not.toBeInTheDocument()
    })

    it('handles no supplier concentration data', () => {
      const noSC = { ...mockFindings, supplier_concentration: undefined }
      setupMocks({ mainData: [noSC, mockInsights, mockVerification, mockLegalFramework, mockOutcomes] })
      renderComponent()
      expect(screen.queryByText('Supplier Concentration')).not.toBeInTheDocument()
    })

    it('handles no procurement compliance data', () => {
      const noPC = { ...mockFindings, procurement_compliance: undefined }
      setupMocks({ mainData: [noPC, mockInsights, mockVerification, mockLegalFramework, mockOutcomes] })
      renderComponent()
      expect(screen.queryByText('Procurement Compliance')).not.toBeInTheDocument()
    })

    it('handles no fraud triangle data', () => {
      const noFT = { ...mockFindings, fraud_triangle: undefined }
      setupMocks({ mainData: [noFT, mockInsights, mockVerification, mockLegalFramework, mockOutcomes] })
      renderComponent()
      expect(screen.queryByText(/Risk Assessment: Fraud Triangle/)).not.toBeInTheDocument()
    })

    it('uses council_full_name in config', () => {
      const customConfig = { ...mockConfig, council_name: 'Test', council_full_name: 'Test Metropolitan Borough' }
      setupMocks({ config: customConfig })
      renderComponent()
      expect(screen.getByText(/DOGE Investigation: Test/)).toBeInTheDocument()
    })
  })
})
