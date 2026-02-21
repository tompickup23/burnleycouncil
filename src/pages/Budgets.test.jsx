import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Budgets from './Budgets'

// Mock recharts — SVG measurement doesn't work in JSDOM
vi.mock('recharts', () => {
  const MockChart = ({ children }) => <div data-testid="recharts-mock">{children}</div>
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    BarChart: MockChart, Bar: () => null, XAxis: () => null, YAxis: () => null,
    CartesianGrid: () => null, Tooltip: () => null,
    PieChart: MockChart, Pie: () => null, Cell: () => null,
    LineChart: MockChart, Line: () => null,
    AreaChart: MockChart, Area: () => null,
    ComposedChart: MockChart, Legend: () => null,
    ReferenceLine: () => null,
  }
})

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
  council_tier: 'district',
  data_sources: { budgets: true, collection_rates: true },
}

const mockBudgetData = {
  revenue_budgets: [
    {
      financial_year: '2023/24',
      net_revenue_budget: 14500000,
      departments: {
        'Economy & Growth': 3200000,
        'Housing & Development Control': 2400000,
        'Leisure Trust': 1800000,
        'Finance & Property': 1500000,
        'Streetscene': 3100000,
        'People & Development': 200000,
      },
      council_tax: { burnley_element: 285.50 },
      funding_sources: {
        council_tax_income: 5400000,
        business_rates_retained: 3800000,
        revenue_support_grant: 2100000,
        new_homes_bonus: 400000,
        other_income: 2800000,
      },
    },
    {
      financial_year: '2024/25',
      net_revenue_budget: 15200000,
      departments: {
        'Economy & Growth': 3500000,
        'Housing & Development Control': 2600000,
        'Leisure Trust': 1900000,
        'Finance & Property': 1600000,
        'Streetscene': 3300000,
        'People & Development': 250000,
      },
      council_tax: { burnley_element: 299.79 },
      funding_sources: {
        council_tax_income: 5700000,
        business_rates_retained: 4000000,
        revenue_support_grant: 2200000,
        new_homes_bonus: 300000,
        other_income: 3000000,
      },
      sub_services: {
        'Economy & Growth': {
          'Business Development': 1200000,
          'Town Centre': 800000,
          'Tourism': 500000,
          'Markets': 1000000,
        },
      },
    },
  ],
  capital_programmes: [
    {
      budget_book_year: '2024/25',
      programme_period: '2024-2029',
      total_all_schemes: 45000000,
      year_totals: { '2024/25': 12000000, '2025/26': 10000000 },
      categories: {
        'Housing & Regeneration': { total: 18000000, note: 'Town centre & housing improvements' },
        'Leisure & Culture': { total: 8000000, note: 'Park upgrades and sport facilities' },
        'Digital & ICT': { total: 5000000, note: 'IT infrastructure renewal' },
        'Fleet & Vehicles': { total: 7000000, note: 'Electric vehicle transition' },
        'Environmental': { total: 7000000, note: 'Flood prevention & green spaces' },
      },
      schemes: [
        { name: 'Pioneer Place', category: 'Housing & Regeneration', total: 8000000, status: 'In Progress' },
        { name: 'Thompson Park', category: 'Leisure & Culture', total: 3000000, status: 'Planned' },
      ],
    },
  ],
  treasury_and_investment: {
    key_context: {
      borrowing: 'Total borrowing: £45M at average 3.2% rate',
      investments: 'Investment portfolio: £22M across multiple counterparties',
      mrp: 'MRP charge: £1.2M annually',
    },
    notable_investments: [
      { name: 'Charter Walk', value: 14000000, type: 'Property', detail: 'Town centre shopping centre' },
    ],
  },
  insights: {
    revenue_vs_capital: {
      current_revenue: 15200000,
      current_capital_5yr: 45000000,
    },
    yoy_changes: [
      {
        from_year: '2023/24',
        to_year: '2024/25',
        previous_budget: 14500000,
        current_budget: 15200000,
        change_amount: 700000,
        change_percent: 4.8,
      },
    ],
    political_highlights: [
      'Council tax increase of 4.99% — maximum allowed without referendum',
      'New £1.2M savings programme identified across all departments',
    ],
    efficiency_metrics: {
      latest_budget: 15200000,
      latest_year: '2024/25',
      total_budget_growth_pct: 4.8,
      years_covered: 2,
      avg_annual_growth_pct: 4.8,
    },
  },
}

const mockInsights = {
  yoy_changes: mockBudgetData.insights.yoy_changes,
  political_highlights: mockBudgetData.insights.political_highlights,
  efficiency_metrics: mockBudgetData.insights.efficiency_metrics,
}

const mockBudgetMapping = {
  coverage: { mapped_spend_pct: 82.5, mapped_spend: 12540000 },
  mapped_departments: 7,
  total_departments: 10,
}

const mockBudgetEfficiency = {
  services: {
    'Economy & Growth': { hhi: 1200, round_number_pct: 15, duplicate_pct: 2 },
    'Streetscene': { hhi: 800, round_number_pct: 8, duplicate_pct: 1 },
  },
}

const mockCollectionRates = {
  latest_rate: 95.8,
  latest_year: '2023-24',
  trend: -0.3,
  five_year_avg: 96.1,
  performance: 'good',
  years: {
    '2019-20': { collection_rate_pct: 96.5, uncollected_thousands: 1200, net_collectable_thousands: 35000 },
    '2020-21': { collection_rate_pct: 94.2, uncollected_thousands: 2100, net_collectable_thousands: 36000 },
    '2021-22': { collection_rate_pct: 95.9, uncollected_thousands: 1500, net_collectable_thousands: 37000 },
    '2022-23': { collection_rate_pct: 96.1, uncollected_thousands: 1400, net_collectable_thousands: 38000 },
    '2023-24': { collection_rate_pct: 95.8, uncollected_thousands: 1600, net_collectable_thousands: 39000 },
  },
  latest_year_detail: {
    quarterly_receipts_thousands: { q1_apr_jun: 9000, q2_jul_sep: 9500, q3_oct_dec: 10000, q4_jan_mar: 9500 },
    total_arrears_thousands: 4200,
    arrears_brought_forward_thousands: 3800,
  },
}

function setupMocks({
  budgetData = mockBudgetData,
  insights = mockInsights,
  mapping = null,
  efficiency = null,
  collectionRates = null,
  config = mockConfig,
  loading = false,
  error = null,
} = {}) {
  useCouncilConfig.mockReturnValue(config)

  if (loading) {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    return
  }
  if (error) {
    useData.mockReturnValue({ data: null, loading: false, error })
    return
  }

  // Build data array: [budgets.json, budget_insights.json, budget_mapping.json, budget_efficiency.json, ...collection_rates]
  const dataArr = [budgetData, insights, mapping, efficiency]
  if (config.data_sources?.collection_rates && collectionRates) {
    dataArr.push(collectionRates)
  }

  useData.mockReturnValue({
    data: dataArr,
    loading: false,
    error: null,
  })
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Budgets />
    </MemoryRouter>
  )
}

describe('Budgets', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('loading and error states', () => {
    it('shows loading state', () => {
      setupMocks({ loading: true })
      renderComponent()
      expect(screen.getByText(/loading budget data/i)).toBeInTheDocument()
    })

    it('shows error state', () => {
      setupMocks({ error: new Error('fail') })
      renderComponent()
      expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
    })

    it('shows no-data state when budgetData is null', () => {
      setupMocks({ budgetData: null })
      renderComponent()
      expect(screen.getByText(/budget data is not yet available/i)).toBeInTheDocument()
    })
  })

  describe('page header and navigation', () => {
    it('renders budget page heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Budget Analysis')).toBeInTheDocument()
    })

    it('renders subtitle with council name', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/comprehensive analysis of burnley borough council/i)).toBeInTheDocument()
    })

    it('renders tab navigation with revenue tab', () => {
      setupMocks()
      renderComponent()
      // "Revenue Budget" appears in both tab and treasury context section
      expect(screen.getAllByText('Revenue Budget').length).toBeGreaterThanOrEqual(1)
    })

    it('renders departments tab', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Departmental Breakdown')).toBeInTheDocument()
    })

    it('renders capital tab when capital data exists', () => {
      setupMocks()
      renderComponent()
      // "Capital Programme" appears in tab + treasury context
      expect(screen.getAllByText('Capital Programme').length).toBeGreaterThanOrEqual(1)
    })

    it('renders treasury tab when treasury data exists', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Treasury & Investment')).toBeInTheDocument()
    })

    it('hides capital tab when no capital data', () => {
      const noCap = { ...mockBudgetData, capital_programmes: [] }
      setupMocks({ budgetData: noCap })
      renderComponent()
      // Tab hidden but context text may still appear — check tab role
      const tabs = screen.getAllByRole('tab')
      const capitalTab = tabs.find(t => t.textContent.includes('Capital Programme'))
      expect(capitalTab).toBeUndefined()
    })

    it('hides treasury tab when no treasury data', () => {
      const noTreasury = { ...mockBudgetData, treasury_and_investment: {} }
      setupMocks({ budgetData: noTreasury })
      renderComponent()
      expect(screen.queryByText('Treasury & Investment')).not.toBeInTheDocument()
    })

    it('tab buttons have correct ARIA roles', () => {
      setupMocks()
      renderComponent()
      const tabs = screen.getAllByRole('tab')
      expect(tabs.length).toBeGreaterThanOrEqual(3) // revenue, departments, capital (+ treasury maybe)
    })
  })

  describe('revenue tab', () => {
    it('shows key metrics — net revenue budget', () => {
      setupMocks()
      renderComponent()
      // Look for the formatted budget value
      expect(screen.getByText('2024/25 Net Revenue Budget')).toBeInTheDocument()
    })

    it('shows budget growth percentage', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('2-Year Budget Growth')).toBeInTheDocument()
    })

    it('shows average annual growth', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Average Annual Growth')).toBeInTheDocument()
    })

    it('shows revenue budget trend heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Revenue Budget Trend')).toBeInTheDocument()
    })

    it('shows year-on-year changes section', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Year-on-Year Changes')).toBeInTheDocument()
    })

    it('shows yoy change card with years', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/2023\/24 → 2024\/25/)).toBeInTheDocument()
    })

    it('shows yoy change percentage', () => {
      setupMocks()
      renderComponent()
      // Format: (+4.8%) inside change-percent span
      expect(screen.getByText(/\(\+4\.8%\)/)).toBeInTheDocument()
    })

    it('shows revenue vs capital explainer for hand-curated data', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/revenue vs capital/i)).toBeInTheDocument()
    })

    it('shows how revenue budget is funded heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/how the revenue budget is funded/i)).toBeInTheDocument()
    })

    it('shows council tax band D heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/council tax.*band d/i)).toBeInTheDocument()
    })

    it('shows council tax tier note for district', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/lancashire county council, police, and fire precepts/i)).toBeInTheDocument()
    })

    it('shows county tier note when county tier configured', () => {
      const countyConfig = { ...mockConfig, council_tier: 'county', council_full_name: 'Lancashire County Council' }
      setupMocks({ config: countyConfig })
      renderComponent()
      expect(screen.getByText(/district council, police, and fire precepts/i)).toBeInTheDocument()
    })

    it('shows political highlights', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Key Political Points')).toBeInTheDocument()
    })
  })

  describe('auto-generated council view', () => {
    const autoGenBudget = {
      ...mockBudgetData,
      _generated: true,
      reserves_trajectory: [
        { year: '2020-21', earmarked: 5000000, unallocated: 2000000, total: 7000000 },
        { year: '2021-22', earmarked: 4500000, unallocated: 1800000, total: 6300000 },
      ],
    }

    it('shows GOV.UK data notice for auto-generated budgets', () => {
      setupMocks({ budgetData: autoGenBudget })
      renderComponent()
      expect(screen.getByText(/about this data/i)).toBeInTheDocument()
    })

    it('shows reserves trajectory section for auto-generated with trajectory', () => {
      setupMocks({ budgetData: autoGenBudget })
      renderComponent()
      expect(screen.getByText('Reserves Trajectory')).toBeInTheDocument()
    })

    it('shows AI DOGE coverage when mapping data available', () => {
      setupMocks({ budgetData: autoGenBudget, mapping: mockBudgetMapping })
      renderComponent()
      expect(screen.getByText(/ai doge data coverage/i)).toBeInTheDocument()
    })

    it('shows coverage percentage', () => {
      setupMocks({ budgetData: autoGenBudget, mapping: mockBudgetMapping })
      renderComponent()
      // 82.5.toFixed(0) = "83"
      expect(screen.getByText('83%')).toBeInTheDocument()
    })
  })

  describe('departments tab', () => {
    it('switches to departments tab on click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Departmental Breakdown'))
      expect(screen.getByText(/department spending/i)).toBeInTheDocument()
    })

    it('shows year selector buttons', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Departmental Breakdown'))
      // Years appear in both year selector buttons AND table column headers
      expect(screen.getAllByText('2023/24').length).toBeGreaterThanOrEqual(2)
      expect(screen.getAllByText('2024/25').length).toBeGreaterThanOrEqual(2)
    })

    it('shows department comparison table', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Departmental Breakdown'))
      expect(screen.getByText('Departmental Budget Comparison')).toBeInTheDocument()
    })

    it('shows core departments in table (excludes People & Development)', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Departmental Breakdown'))
      expect(screen.getByText('Economy & Growth')).toBeInTheDocument()
      expect(screen.getByText('Streetscene')).toBeInTheDocument()
      // People & Development is in EXCLUDED_DEPARTMENTS
      expect(screen.queryByText('People & Development')).not.toBeInTheDocument()
    })

    it('shows change column with growth percentages', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Departmental Breakdown'))
      // Economy & Growth: 3.2M → 3.5M = +9% growth
      const cells = screen.getAllByText(/\+\d+%/)
      expect(cells.length).toBeGreaterThan(0)
    })

    it('switches year when year button clicked', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Departmental Breakdown'))
      // Click the year button (use aria-label to distinguish from table header)
      const yearBtn = screen.getByLabelText(/show 2023\/24 budget/i)
      fireEvent.click(yearBtn)
      expect(screen.getByText(/department spending — 2023\/24/i)).toBeInTheDocument()
    })

    it('shows fastest growing departments section', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Departmental Breakdown'))
      expect(screen.getByText(/fastest growing/i)).toBeInTheDocument()
    })
  })

  describe('capital tab', () => {
    function clickCapitalTab() {
      // "Capital Programme" appears in tab AND treasury context — target the tab by role
      const tabs = screen.getAllByRole('tab')
      const capitalTab = tabs.find(t => t.textContent.includes('Capital Programme'))
      fireEvent.click(capitalTab)
    }

    it('switches to capital tab on click', () => {
      setupMocks()
      renderComponent()
      clickCapitalTab()
      expect(screen.getByText(/what is the capital programme/i)).toBeInTheDocument()
    })

    it('shows capital programme period', () => {
      setupMocks()
      renderComponent()
      clickCapitalTab()
      expect(screen.getByText(/2024-2029 capital programme/i)).toBeInTheDocument()
    })

    it('shows capital by category chart heading', () => {
      setupMocks()
      renderComponent()
      clickCapitalTab()
      expect(screen.getByText('Current Capital Programme by Category')).toBeInTheDocument()
    })

    it('shows capital programme size over time heading', () => {
      setupMocks()
      renderComponent()
      clickCapitalTab()
      expect(screen.getByText('Capital Programme Size Over Time')).toBeInTheDocument()
    })

    it('shows major capital schemes section', () => {
      setupMocks()
      renderComponent()
      clickCapitalTab()
      expect(screen.getByText('Major Capital Schemes')).toBeInTheDocument()
    })

    it('shows notable investment names', () => {
      setupMocks()
      renderComponent()
      clickCapitalTab()
      // Notable investments rendered in capital tab from treasury.notable_investments
      expect(screen.getByText('Charter Walk')).toBeInTheDocument()
    })
  })

  describe('treasury tab', () => {
    it('switches to treasury tab on click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Treasury & Investment'))
      expect(screen.getByText(/treasury management & investment strategy/i)).toBeInTheDocument()
    })

    it('shows borrowing context', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Treasury & Investment'))
      expect(screen.getByText('Borrowing')).toBeInTheDocument()
      expect(screen.getByText(/total borrowing: £45M/i)).toBeInTheDocument()
    })

    it('shows investments context', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Treasury & Investment'))
      expect(screen.getByText('Investments')).toBeInTheDocument()
    })

    it('shows MRP context', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Treasury & Investment'))
      expect(screen.getByText('Minimum Revenue Provision (MRP)')).toBeInTheDocument()
    })

    it('shows key budget trends section', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Treasury & Investment'))
      expect(screen.getByText('Key Budget Trends')).toBeInTheDocument()
    })

    it('shows how council finance works section', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Treasury & Investment'))
      expect(screen.getByText('How Council Finance Works')).toBeInTheDocument()
    })
  })

  describe('collection rates', () => {
    it('shows collection rate section when data available', () => {
      setupMocks({ collectionRates: mockCollectionRates })
      renderComponent()
      expect(screen.getByText(/council tax collection performance/i)).toBeInTheDocument()
    })

    it('shows latest rate value', () => {
      setupMocks({ collectionRates: mockCollectionRates })
      renderComponent()
      expect(screen.getByText('95.8%')).toBeInTheDocument()
    })

    it('shows performance badge', () => {
      setupMocks({ collectionRates: mockCollectionRates })
      renderComponent()
      expect(screen.getByText('Good')).toBeInTheDocument()
    })

    it('shows five-year average', () => {
      setupMocks({ collectionRates: mockCollectionRates })
      renderComponent()
      expect(screen.getByText('96.1%')).toBeInTheDocument()
    })

    it('shows total arrears when present', () => {
      setupMocks({ collectionRates: mockCollectionRates })
      renderComponent()
      expect(screen.getByText('Total Arrears')).toBeInTheDocument()
    })
  })

  describe('reform vs conservative spotlight', () => {
    const reformBudget = {
      ...mockBudgetData,
      insights: {
        ...mockBudgetData.insights,
        reform_vs_conservative: {
          description: 'First Reform UK budget compared to Conservative predecessor',
          council_tax_increase: {
            '2026_27_reform': 3.8,
            '2025_26_conservative': 4.99,
            saving_per_band_d: 3.57,
          },
          budget_growth: {
            increase: 1500000,
            increase_pct: 5.2,
            baseline_2025_26: 15200000,
            budget_2026_27: 16700000,
          },
          pressures_absorbed: {
            inflation: 800000,
            demand: 400000,
            capital_financing: 200000,
            other: 100000,
          },
          savings_delivered: {
            existing_from_conservatives: -600000,
            new_reform_savings: -1200000,
            net_savings: -1800000,
          },
        },
      },
    }

    it('shows reform vs conservative section when data exists', () => {
      setupMocks({ budgetData: reformBudget })
      renderComponent()
      expect(screen.getByText('Reform vs Conservative: Budget Comparison')).toBeInTheDocument()
    })

    it('shows reform CT rise percentage', () => {
      setupMocks({ budgetData: reformBudget })
      renderComponent()
      expect(screen.getByText('3.8%')).toBeInTheDocument()
      expect(screen.getByText('Reform CT Rise')).toBeInTheDocument()
    })

    it('shows saved per band D', () => {
      setupMocks({ budgetData: reformBudget })
      renderComponent()
      expect(screen.getByText('Saved per Band D')).toBeInTheDocument()
    })

    it('shows how budget gap was closed waterfall', () => {
      setupMocks({ budgetData: reformBudget })
      renderComponent()
      expect(screen.getByText('How the Budget Gap Was Closed')).toBeInTheDocument()
    })
  })

  describe('BudgetTrendsView (non-budget councils)', () => {
    const nonBudgetConfig = {
      ...mockConfig,
      data_sources: { budgets: false, budget_trends: true },
    }

    const mockGovuk = {
      revenue_summary: {
        service_expenditure: {
          'TOTAL SERVICE EXPENDITURE': { value_pounds: 80000000, relevant_to_districts: true },
          'Housing services': { value_pounds: 25000000, relevant_to_districts: true },
          'Planning services': { value_pounds: 8000000, relevant_to_districts: true },
        },
        key_financials: {
          'NET REVENUE EXPENDITURE': { value_pounds: 50000000 },
          'COUNCIL TAX REQUIREMENT': { value_pounds: 12000000 },
        },
      },
      data_year: '2022-23',
    }

    const mockSummary = {
      council_tax_band_d: 220.50,
      reserves_total: 8000000,
      reserves_pct_of_spend: 16,
      multi_year: true,
      years: ['2020-21', '2021-22', '2022-23'],
      year_summaries: {
        '2020-21': { total_service_expenditure: 70000000, net_revenue_expenditure: 44000000 },
        '2021-22': { total_service_expenditure: 75000000, net_revenue_expenditure: 47000000 },
        '2022-23': { total_service_expenditure: 80000000, net_revenue_expenditure: 50000000 },
      },
      trends: {
        headline_trends: { total_service_expenditure_change: 14.3, net_revenue_change: 13.6 },
      },
    }

    function setupNonBudget({
      govukData = mockGovuk,
      summaryData = mockSummary,
      trendsData = null,
      insightsData = null,
      efficiencyData = null,
      mappingData = null,
      collectionRates = null,
    } = {}) {
      useCouncilConfig.mockReturnValue(nonBudgetConfig)
      // For non-budget: [budgets_govuk.json, revenue_trends.json, budgets_summary.json, budget_insights.json, budget_efficiency.json, budget_mapping.json]
      useData.mockReturnValue({
        data: [govukData, trendsData, summaryData, insightsData, efficiencyData, mappingData],
        loading: false,
        error: null,
      })
    }

    it('renders BudgetTrendsView heading for non-budget councils', () => {
      setupNonBudget()
      renderComponent()
      expect(screen.getByText('Budget Overview')).toBeInTheDocument()
    })

    it('shows GOV.UK data source notice', () => {
      setupNonBudget()
      renderComponent()
      // "About this data" appears in explainer + context section h2
      expect(screen.getAllByText(/about this data/i).length).toBeGreaterThanOrEqual(1)
    })

    it('shows revenue outturn subtitle', () => {
      setupNonBudget()
      renderComponent()
      expect(screen.getByText(/revenue outturn data for burnley borough council/i)).toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('handles empty revenue budgets array', () => {
      const emptyBudget = { ...mockBudgetData, revenue_budgets: [], insights: {} }
      setupMocks({ budgetData: emptyBudget })
      renderComponent()
      expect(screen.getByText('Budget Analysis')).toBeInTheDocument()
    })

    it('handles missing insights gracefully', () => {
      setupMocks({ insights: null })
      renderComponent()
      expect(screen.getByText('Budget Analysis')).toBeInTheDocument()
    })

    it('handles single-year budget data', () => {
      const singleYear = {
        ...mockBudgetData,
        revenue_budgets: [mockBudgetData.revenue_budgets[0]],
      }
      setupMocks({ budgetData: singleYear })
      renderComponent()
      expect(screen.getByText('Budget Analysis')).toBeInTheDocument()
    })

    it('handles departments with zero values (hidden from pie chart)', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Departmental Breakdown'))
      // People & Development is in EXCLUDED_DEPARTMENTS, should not appear
      const deptHeaders = screen.queryAllByText('People & Development')
      expect(deptHeaders.length).toBe(0)
    })

    it('handles empty funding sources', () => {
      const noFunding = {
        ...mockBudgetData,
        revenue_budgets: [{
          ...mockBudgetData.revenue_budgets[0],
          funding_sources: {},
        }],
      }
      setupMocks({ budgetData: noFunding })
      renderComponent()
      // Should still render without crashing
      expect(screen.getByText('Budget Analysis')).toBeInTheDocument()
    })

    it('renders without collection rates config', () => {
      const noCollectionConfig = { ...mockConfig, data_sources: { budgets: true } }
      setupMocks({ config: noCollectionConfig })
      renderComponent()
      expect(screen.queryByText(/collection performance/i)).not.toBeInTheDocument()
    })
  })
})
