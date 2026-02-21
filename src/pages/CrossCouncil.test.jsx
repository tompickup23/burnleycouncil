import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CrossCouncil from './CrossCouncil'

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
}

const mockCrossCouncilData = {
  councils: [{
    council_id: 'burnley',
    council_name: 'Burnley',
    total_spend: 355000000,
    total_records: 30580,
    unique_suppliers: 1200,
    population: 88000,
    transparency: { has_dates: 100, has_suppliers: 95, has_departments: 80 },
  }],
  generated: '2025-02-01',
}

// Rich mock data with multiple councils for thorough testing
const mockRichData = {
  councils: [
    {
      council_id: 'burnley',
      council_name: 'Burnley',
      council_tier: 'district',
      total_spend: 355000000,
      annual_spend: 71000000,
      total_records: 30580,
      annual_records: 6116,
      unique_suppliers: 1200,
      population: 88000,
      num_years: 5,
      financial_years: ['2019-20', '2020-21', '2021-22', '2022-23', '2023-24'],
      overall_hhi: 1800,
      transparency: { has_dates: 100, has_suppliers: 95, has_departments: 80 },
      service_expenditure: {
        housing: 5200,
        cultural: 3100,
        environmental: 6800,
        planning: 2400,
        central: 4500,
        other: 1200,
      },
      budget_summary: {
        council_tax_band_d: 312.50,
        council_tax_band_d_total: 2150.80,
        net_revenue_expenditure: 14500000,
        council_tax_requirement: 9800000,
        reserves_total: 12000000,
        reserves_earmarked_closing: 9500000,
        reserves_unallocated_closing: 2500000,
        reserves_change: -800000,
      },
      collection_rate: 94.2,
      collection_rate_5yr_avg: 94.8,
      collection_rate_trend: -0.3,
      uncollected_ct_gbp: 2800000,
      collection_performance: 'below_average',
      dependency_ratio: 68.5,
      youth_ratio: 22.1,
      elderly_ratio: 46.4,
      working_age_pct: 59.4,
      pay: {
        ceo_midpoint: 125000,
        ceo_to_median_ratio: 5.2,
        median_employee_salary: 24038,
      },
      duplicate_value: 1500000,
      duplicate_count: 45,
      service_hhi: {
        'Housing': { hhi: 2100 },
        'Environmental': { hhi: 900 },
        'Cultural': { hhi: 3200 },
      },
    },
    {
      council_id: 'hyndburn',
      council_name: 'Hyndburn',
      council_tier: 'district',
      total_spend: 211000000,
      annual_spend: 42200000,
      total_records: 29804,
      annual_records: 5961,
      unique_suppliers: 950,
      population: 81000,
      num_years: 5,
      financial_years: ['2019-20', '2020-21', '2021-22', '2022-23', '2023-24'],
      overall_hhi: 1200,
      transparency: { has_dates: 98, has_suppliers: 90, has_departments: 70 },
      service_expenditure: {
        housing: 4800,
        cultural: 2900,
        environmental: 5500,
        planning: 2100,
        central: 3800,
        other: 900,
      },
      budget_summary: {
        council_tax_band_d: 285.40,
        council_tax_band_d_total: 2080.20,
        net_revenue_expenditure: 12000000,
        council_tax_requirement: 8200000,
        reserves_total: 8500000,
        reserves_earmarked_closing: 6200000,
        reserves_unallocated_closing: 2300000,
        reserves_change: 300000,
      },
      collection_rate: 96.1,
      collection_rate_5yr_avg: 95.9,
      collection_rate_trend: 0.1,
      uncollected_ct_gbp: 1800000,
      collection_performance: 'good',
      dependency_ratio: 62.3,
      youth_ratio: 20.5,
      elderly_ratio: 41.8,
      working_age_pct: 61.7,
      pay: {
        ceo_midpoint: 115000,
        ceo_to_median_ratio: 4.8,
        median_employee_salary: 23958,
      },
      duplicate_value: 800000,
      duplicate_count: 22,
      service_hhi: {
        'Housing': { hhi: 1400 },
        'Environmental': { hhi: 750 },
        'Cultural': { hhi: 1800 },
      },
    },
    {
      council_id: 'pendle',
      council_name: 'Pendle',
      council_tier: 'district',
      total_spend: 125000000,
      annual_spend: 25000000,
      total_records: 49741,
      annual_records: 9948,
      unique_suppliers: 800,
      population: 92000,
      num_years: 5,
      financial_years: ['2019-20', '2020-21', '2021-22', '2022-23', '2023-24'],
      overall_hhi: 2800,
      transparency: { has_dates: 85, has_suppliers: 78, has_departments: 45 },
      service_expenditure: {
        housing: 3900,
        cultural: 2200,
        environmental: 4100,
        planning: 1800,
        central: 3200,
        other: 700,
      },
      budget_summary: {
        council_tax_band_d: 298.70,
        council_tax_band_d_total: 2010.50,
        net_revenue_expenditure: 13200000,
        council_tax_requirement: 9100000,
        reserves_total: 6000000,
        reserves_earmarked_closing: 4800000,
        reserves_unallocated_closing: 1200000,
        reserves_change: -1200000,
      },
      collection_rate: 92.5,
      collection_rate_5yr_avg: 93.1,
      collection_rate_trend: -0.4,
      uncollected_ct_gbp: 3500000,
      collection_performance: 'poor',
      dependency_ratio: 71.2,
      youth_ratio: 24.8,
      elderly_ratio: 46.4,
      working_age_pct: 58.4,
      pay: {
        ceo_midpoint: 105000,
        ceo_to_median_ratio: 4.5,
        median_employee_salary: 23333,
      },
      duplicate_value: 2200000,
      duplicate_count: 67,
      service_hhi: {
        'Housing': { hhi: 2900 },
        'Environmental': { hhi: 1600 },
        'Cultural': { hhi: 4500 },
      },
    },
    {
      council_id: 'rossendale',
      council_name: 'Rossendale',
      council_tier: 'district',
      total_spend: 64000000,
      annual_spend: 12800000,
      total_records: 2500,
      annual_records: 500,
      unique_suppliers: 320,
      population: 71000,
      num_years: 5,
      financial_years: ['2019-20', '2020-21', '2021-22', '2022-23', '2023-24'],
      overall_hhi: 950,
      transparency: { has_dates: 92, has_suppliers: 88, has_departments: 60 },
      service_expenditure: {
        housing: 2800,
        cultural: 1500,
        environmental: 3900,
        planning: 1200,
        central: 2600,
        other: 500,
      },
      budget_summary: {
        council_tax_band_d: 275.30,
        council_tax_band_d_total: 1950.10,
        net_revenue_expenditure: 10500000,
        council_tax_requirement: 7400000,
        reserves_total: 5200000,
        reserves_earmarked_closing: 3800000,
        reserves_unallocated_closing: 1400000,
        reserves_change: 100000,
      },
      collection_rate: 97.3,
      collection_rate_5yr_avg: 97.0,
      collection_rate_trend: 0.2,
      uncollected_ct_gbp: 900000,
      collection_performance: 'excellent',
      dependency_ratio: 59.8,
      youth_ratio: 19.2,
      elderly_ratio: 40.6,
      working_age_pct: 62.6,
      pay: {
        ceo_midpoint: 98000,
        ceo_to_median_ratio: 4.1,
        median_employee_salary: 23902,
      },
      duplicate_value: 350000,
      duplicate_count: 11,
      service_hhi: {
        'Housing': { hhi: 800 },
        'Environmental': { hhi: 650 },
      },
    },
  ],
  supplier_index: {
    shared_suppliers: [
      {
        supplier: 'BIFFA WASTE SERVICES',
        councils_count: 4,
        total_spend: 8500000,
        councils: [
          { council_id: 'burnley', council_name: 'Burnley', spend: 3200000 },
          { council_id: 'hyndburn', council_name: 'Hyndburn', spend: 2800000 },
          { council_id: 'pendle', council_name: 'Pendle', spend: 1500000 },
          { council_id: 'rossendale', council_name: 'Rossendale', spend: 1000000 },
        ],
      },
      {
        supplier: 'LIBERATA UK LTD',
        councils_count: 3,
        total_spend: 5200000,
        councils: [
          { council_id: 'burnley', council_name: 'Burnley', spend: 2100000 },
          { council_id: 'pendle', council_name: 'Pendle', spend: 1800000 },
          { council_id: 'hyndburn', council_name: 'Hyndburn', spend: 1300000 },
        ],
      },
      {
        supplier: 'UNKNOWN',
        councils_count: 4,
        total_spend: 200000,
        councils: [],
      },
      {
        supplier: 'SOLO COUNCIL LTD',
        councils_count: 1,
        total_spend: 500000,
        councils: [
          { council_id: 'burnley', council_name: 'Burnley', spend: 500000 },
        ],
      },
    ],
  },
  generated: '2025-02-01',
}

// Mock data for mixed-tier scenario
const mockMixedTierData = {
  councils: [
    ...mockRichData.councils,
    {
      council_id: 'lancashire_cc',
      council_name: 'Lancashire',
      council_tier: 'county',
      total_spend: 3600000000,
      annual_spend: 720000000,
      total_records: 753220,
      annual_records: 150644,
      unique_suppliers: 5000,
      population: 1228000,
      num_years: 5,
      financial_years: ['2019-20', '2020-21', '2021-22', '2022-23', '2023-24'],
      overall_hhi: 600,
      transparency: { has_dates: 99, has_suppliers: 97, has_departments: 92 },
      service_expenditure: {
        education: 280000,
        adult_social_care: 310000,
        children_social_care: 120000,
        public_health: 45000,
        highways: 85000,
        cultural: 12000,
        environmental: 18000,
        planning: 5000,
        central: 35000,
        other: 8000,
      },
      budget_summary: {
        council_tax_band_d: 1632.89,
        net_revenue_expenditure: 815000000,
        council_tax_requirement: 620000000,
        reserves_total: 380000000,
        reserves_earmarked_closing: 340000000,
        reserves_unallocated_closing: 40000000,
        reserves_change: -25000000,
      },
      dependency_ratio: 63.1,
      youth_ratio: 21.3,
      elderly_ratio: 41.8,
      working_age_pct: 61.3,
      pay: {
        ceo_midpoint: 195000,
        ceo_to_median_ratio: 7.8,
        median_employee_salary: 25000,
      },
      duplicate_value: 12000000,
      duplicate_count: 350,
      service_hhi: {
        'Education': { hhi: 400 },
        'Adult Social Care': { hhi: 550 },
        'Highways': { hhi: 800 },
      },
    },
    {
      council_id: 'blackpool',
      council_name: 'Blackpool',
      council_tier: 'unitary',
      total_spend: 4100000000,
      annual_spend: 585714286,
      total_records: 630914,
      annual_records: 90131,
      unique_suppliers: 4200,
      population: 141000,
      num_years: 7,
      financial_years: ['2017-18', '2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24'],
      overall_hhi: 1100,
      transparency: { has_dates: 96, has_suppliers: 91, has_departments: 85 },
      service_expenditure: {
        education: 95000,
        adult_social_care: 68000,
        children_social_care: 45000,
        public_health: 22000,
        highways: 18000,
        housing: 8000,
        cultural: 5500,
        environmental: 12000,
        planning: 3500,
        central: 15000,
        other: 4000,
      },
      budget_summary: {
        council_tax_band_d: 1780.50,
        net_revenue_expenditure: 195000000,
        council_tax_requirement: 68000000,
        reserves_total: 42000000,
        reserves_earmarked_closing: 35000000,
        reserves_unallocated_closing: 7000000,
        reserves_change: -5000000,
      },
      collection_rate: 91.8,
      collection_rate_5yr_avg: 92.0,
      collection_rate_trend: -0.1,
      uncollected_ct_gbp: 5500000,
      collection_performance: 'poor',
      dependency_ratio: 66.9,
      youth_ratio: 21.8,
      elderly_ratio: 45.1,
      working_age_pct: 59.9,
      pay: {
        ceo_midpoint: 165000,
        ceo_to_median_ratio: 6.4,
        median_employee_salary: 25781,
      },
      duplicate_value: 8500000,
      duplicate_count: 230,
      service_hhi: {
        'Education': { hhi: 750 },
        'Adult Social Care': { hhi: 900 },
        'Housing': { hhi: 1200 },
      },
    },
  ],
  supplier_index: mockRichData.supplier_index,
  generated: '2025-02-01',
}

// Council with missing data for quality warning tests
const mockMissingDataCouncils = {
  councils: [
    ...mockRichData.councils.slice(0, 2),
    {
      council_id: 'wyre',
      council_name: 'Wyre',
      council_tier: 'district',
      total_spend: 678000000,
      annual_spend: 135600000,
      total_records: 51092,
      annual_records: 10218,
      unique_suppliers: 1500,
      population: 112000,
      num_years: 5,
      financial_years: ['2019-20', '2020-21', '2021-22', '2022-23', '2023-24'],
      overall_hhi: 2797,
      transparency: { has_dates: 90, has_suppliers: 85, has_departments: 55 },
      // No service_expenditure — should trigger data quality warning
      budget_summary: null, // No budget_summary — should trigger data quality warning
      dependency_ratio: 72.4,
      youth_ratio: 18.5,
      elderly_ratio: 53.9,
      working_age_pct: 58.0,
      duplicate_value: 4500000,
      duplicate_count: 120,
    },
  ],
  generated: '2025-02-01',
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <CrossCouncil />
    </MemoryRouter>
  )
}

describe('CrossCouncil', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading comparison data/i)).toBeInTheDocument()
  })

  it('shows error state', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/unable to load data/i)).toBeInTheDocument()
  })

  it('renders cross-council page heading with data', () => {
    useData.mockReturnValue({
      data: mockCrossCouncilData,
      loading: false,
      error: null,
    })
    renderComponent()
    expect(screen.getByText('Cross-Council Comparison')).toBeInTheDocument()
  })

  // --- Council Overview Cards ---
  describe('Council overview cards', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
    })

    it('renders a card for each council', () => {
      renderComponent()
      const overviewSection = document.querySelector('.cross-overview')
      const overview = within(overviewSection)
      expect(overview.getByText('Burnley')).toBeInTheDocument()
      expect(overview.getByText('Hyndburn')).toBeInTheDocument()
      expect(overview.getByText('Pendle')).toBeInTheDocument()
      expect(overview.getByText('Rossendale')).toBeInTheDocument()
    })

    it('highlights current council with "You are here" badge', () => {
      renderComponent()
      expect(screen.getByText('You are here')).toBeInTheDocument()
      // "You are here" should be inside the Burnley card
      const badge = screen.getByText('You are here')
      const card = badge.closest('.overview-card')
      expect(card).toHaveClass('current')
    })

    it('shows unique suppliers count for each council', () => {
      renderComponent()
      const overviewSection = document.querySelector('.cross-overview')
      const overview = within(overviewSection)
      expect(overview.getByText('1,200')).toBeInTheDocument()
      expect(overview.getByText('950')).toBeInTheDocument()
      expect(overview.getByText('800')).toBeInTheDocument()
      expect(overview.getByText('320')).toBeInTheDocument()
    })

    it('shows years of data for each council', () => {
      renderComponent()
      const yearLabels = screen.getAllByText('Years of Data')
      expect(yearLabels.length).toBe(4)
    })

    it('does not show "You are here" for non-current councils', () => {
      renderComponent()
      const badges = screen.getAllByText('You are here')
      expect(badges.length).toBe(1)
    })
  })

  // --- Tier Filtering Toggle ---
  describe('Tier filtering toggle', () => {
    it('defaults to same-tier view when enough peers exist', () => {
      useData.mockReturnValue({ data: mockMixedTierData, loading: false, error: null })
      renderComponent()
      // With 4 district councils + 1 county + 1 unitary, districts have 4 peers (>= 3)
      // so it should default to same-tier only and show the "Show all" button
      expect(screen.getByText(/Show all 6 councils/)).toBeInTheDocument()
    })

    it('toggles to show all tiers when button is clicked', () => {
      useData.mockReturnValue({ data: mockMixedTierData, loading: false, error: null })
      renderComponent()
      const showAllBtn = screen.getByText(/Show all 6 councils/)
      fireEvent.click(showAllBtn)
      // After toggling, should show "Show district councils only"
      expect(screen.getByText(/Show district councils only/)).toBeInTheDocument()
    })

    it('can toggle back to same-tier view', () => {
      useData.mockReturnValue({ data: mockMixedTierData, loading: false, error: null })
      renderComponent()
      // First show all
      fireEvent.click(screen.getByText(/Show all 6 councils/))
      // Then toggle back
      fireEvent.click(screen.getByText(/Show district councils only/))
      // Should be back to same-tier
      expect(screen.getByText(/Show all 6 councils/)).toBeInTheDocument()
    })

    it('defaults to showing all tiers when too few peers in same tier', () => {
      // For county tier (only LCC), not enough peers so defaults to all
      useCouncilConfig.mockReturnValue({
        ...mockConfig,
        council_id: 'lancashire_cc',
        council_name: 'Lancashire',
        council_tier: 'county',
      })
      useData.mockReturnValue({ data: mockMixedTierData, loading: false, error: null })
      renderComponent()
      // Should show "Comparing all 6 Lancashire councils"
      expect(screen.getByText(/Comparing all 6 Lancashire councils/)).toBeInTheDocument()
    })

    it('shows tier description for districts', () => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
      renderComponent()
      expect(screen.getByText(/District councils provide housing/)).toBeInTheDocument()
    })
  })

  // --- Spend Per Head Section ---
  describe('Spend per head section', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
    })

    it('renders the spend per head heading', () => {
      renderComponent()
      expect(screen.getByText('Annual Spend Per Head of Population')).toBeInTheDocument()
    })

    it('renders the spend per head chart container with aria-label', () => {
      renderComponent()
      const chart = screen.getByRole('img', { name: /bar chart comparing spend per head/i })
      expect(chart).toBeInTheDocument()
    })

    it('shows explanatory intro text about annualization', () => {
      renderComponent()
      expect(screen.getByText(/figures are annualized to allow fair comparison/i)).toBeInTheDocument()
    })
  })

  // --- Service Expenditure Section ---
  describe('Service expenditure section', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
    })

    it('renders the service expenditure heading', () => {
      renderComponent()
      expect(screen.getByText('Service Expenditure Per Head')).toBeInTheDocument()
    })

    it('renders the grouped bar chart container', () => {
      renderComponent()
      const chart = screen.getByRole('img', { name: /grouped bar chart comparing service expenditure/i })
      expect(chart).toBeInTheDocument()
    })

    it('shows GOV.UK source info in intro text', () => {
      renderComponent()
      expect(screen.getByText(/GOV\.UK revenue outturn data \(2024-25\)/)).toBeInTheDocument()
    })

    it('does not show upper-tier note when in same-tier district view', () => {
      renderComponent()
      expect(screen.queryByText(/District councils show zero for upper-tier services/)).not.toBeInTheDocument()
    })

    it('shows upper-tier note when all tiers are displayed', () => {
      useData.mockReturnValue({ data: mockMixedTierData, loading: false, error: null })
      renderComponent()
      // Toggle to show all
      fireEvent.click(screen.getByText(/Show all 6 councils/))
      expect(screen.getByText(/District councils show zero for upper-tier services/)).toBeInTheDocument()
    })
  })

  // --- Council Tax Band D Section ---
  describe('Council Tax Band D section', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
    })

    it('renders the council tax heading', () => {
      renderComponent()
      expect(screen.getByText(/Council Tax Band D/)).toBeInTheDocument()
    })

    it('renders the council tax chart with aria-label', () => {
      renderComponent()
      const chart = screen.getByRole('img', { name: /bar chart comparing council tax band d/i })
      expect(chart).toBeInTheDocument()
    })

    it('shows district-specific description', () => {
      renderComponent()
      expect(screen.getByText(/District council element of Band D/)).toBeInTheDocument()
    })

    it('shows county precept description for county tier', () => {
      useCouncilConfig.mockReturnValue({
        ...mockConfig,
        council_id: 'lancashire_cc',
        council_name: 'Lancashire',
        council_tier: 'county',
      })
      useData.mockReturnValue({ data: mockMixedTierData, loading: false, error: null })
      renderComponent()
      expect(screen.getByText(/County Precept/)).toBeInTheDocument()
    })

    it('does not render council tax section when no councils have band D data', () => {
      const noBandDData = {
        councils: mockRichData.councils.map(c => ({
          ...c,
          budget_summary: { ...c.budget_summary, council_tax_band_d: undefined },
        })),
        generated: '2025-02-01',
      }
      useData.mockReturnValue({ data: noBandDData, loading: false, error: null })
      renderComponent()
      expect(screen.queryByText(/Council Tax Band D/)).not.toBeInTheDocument()
    })
  })

  // --- Collection Rates Section ---
  describe('Collection rates section', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
    })

    it('renders the collection rate heading', () => {
      renderComponent()
      expect(screen.getByText('Council Tax Collection Rate')).toBeInTheDocument()
    })

    it('renders the collection rate chart with aria-label', () => {
      renderComponent()
      const chart = screen.getByRole('img', { name: /bar chart comparing council tax collection rates/i })
      expect(chart).toBeInTheDocument()
    })

    it('shows source text with GOV.UK QRC4 reference', () => {
      renderComponent()
      expect(screen.getByText(/GOV\.UK QRC4 council tax collection statistics/)).toBeInTheDocument()
    })

    it('shows current council collection performance', () => {
      renderComponent()
      expect(screen.getByText(/Below average/)).toBeInTheDocument()
    })

    it('does not render when no councils have collection rates', () => {
      const noCollectionData = {
        councils: mockRichData.councils.map(c => ({ ...c, collection_rate: undefined })),
        generated: '2025-02-01',
      }
      useData.mockReturnValue({ data: noCollectionData, loading: false, error: null })
      renderComponent()
      expect(screen.queryByText('Council Tax Collection Rate')).not.toBeInTheDocument()
    })
  })

  // --- NRE Per Head Section ---
  describe('NRE per head section', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
    })

    it('renders the NRE heading', () => {
      renderComponent()
      expect(screen.getByText('Net Revenue Expenditure Per Head')).toBeInTheDocument()
    })

    it('renders the NRE chart with aria-label', () => {
      renderComponent()
      const chart = screen.getByRole('img', { name: /bar chart comparing net revenue expenditure per head/i })
      expect(chart).toBeInTheDocument()
    })

    it('shows intro explaining what NRE is', () => {
      renderComponent()
      expect(screen.getByText(/NRE is the total cost of running the council/)).toBeInTheDocument()
    })

    it('does not render when no councils have NRE data', () => {
      const noNreData = {
        councils: mockRichData.councils.map(c => ({
          ...c,
          budget_summary: { ...c.budget_summary, net_revenue_expenditure: undefined },
        })),
        generated: '2025-02-01',
      }
      useData.mockReturnValue({ data: noNreData, loading: false, error: null })
      renderComponent()
      expect(screen.queryByText('Net Revenue Expenditure Per Head')).not.toBeInTheDocument()
    })
  })

  // --- Reserves Comparison Section ---
  describe('Reserves comparison section', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
    })

    it('renders the reserves heading', () => {
      renderComponent()
      expect(screen.getByText('Reserves Per Head (Closing Balance)')).toBeInTheDocument()
    })

    it('renders the reserves chart with aria-label', () => {
      renderComponent()
      const chart = screen.getByRole('img', { name: /stacked bar chart comparing reserves per head/i })
      expect(chart).toBeInTheDocument()
    })

    it('shows earmarked and unallocated breakdown in detail cards', () => {
      renderComponent()
      // Burnley: earmarked = 9500000/1000000 = 10 (rounded), unallocated = 2500000/1000000 = 3 (rounded)
      const earmarkedLabels = screen.getAllByText('Earmarked')
      expect(earmarkedLabels.length).toBeGreaterThanOrEqual(4)
      const unallocatedLabels = screen.getAllByText('Unallocated')
      expect(unallocatedLabels.length).toBeGreaterThanOrEqual(4)
    })

    it('shows total reserves in detail cards', () => {
      renderComponent()
      const totalLabels = screen.getAllByText('Total')
      expect(totalLabels.length).toBeGreaterThanOrEqual(4)
    })

    it('shows reserves change in detail cards', () => {
      renderComponent()
      const changeLabels = screen.getAllByText('Change')
      expect(changeLabels.length).toBeGreaterThanOrEqual(4)
    })

    it('highlights current council reserve card', () => {
      renderComponent()
      const reserveCards = document.querySelectorAll('.reserves-detail-card.current')
      expect(reserveCards.length).toBe(1)
    })

    it('does not render when no councils have reserves data', () => {
      const noReservesData = {
        councils: mockRichData.councils.map(c => ({
          ...c,
          budget_summary: { ...c.budget_summary, reserves_total: undefined },
        })),
        generated: '2025-02-01',
      }
      useData.mockReturnValue({ data: noReservesData, loading: false, error: null })
      renderComponent()
      expect(screen.queryByText('Reserves Per Head (Closing Balance)')).not.toBeInTheDocument()
    })
  })

  // --- Dependency Ratio Section ---
  describe('Dependency ratio section', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
    })

    it('renders the dependency ratio heading', () => {
      renderComponent()
      expect(screen.getByText('Dependency Ratio (Census 2021)')).toBeInTheDocument()
    })

    it('renders the dependency ratio chart with aria-label', () => {
      renderComponent()
      const chart = screen.getByRole('img', { name: /bar chart comparing dependency ratios/i })
      expect(chart).toBeInTheDocument()
    })

    it('shows Census 2021 source attribution', () => {
      renderComponent()
      expect(screen.getByText(/Census 2021 \(ONS Nomis\)/)).toBeInTheDocument()
    })

    it('shows current council ratio with elderly and youth breakdown', () => {
      renderComponent()
      // Burnley: 68.5% (46.4% elderly, 22.1% youth)
      expect(screen.getByText(/Burnley: 68\.5%/)).toBeInTheDocument()
    })

    it('does not render when no councils have dependency data', () => {
      const noDepData = {
        councils: mockRichData.councils.map(c => ({ ...c, dependency_ratio: 0 })),
        generated: '2025-02-01',
      }
      useData.mockReturnValue({ data: noDepData, loading: false, error: null })
      renderComponent()
      expect(screen.queryByText('Dependency Ratio (Census 2021)')).not.toBeInTheDocument()
    })
  })

  // --- HHI Heatmap Table ---
  describe('HHI heatmap table', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
    })

    it('renders the supplier concentration heading', () => {
      renderComponent()
      expect(screen.getByText('Supplier Concentration by Service')).toBeInTheDocument()
    })

    it('renders the HHI table with correct aria-label', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /per-service supplier concentration hhi/i })
      expect(table).toBeInTheDocument()
    })

    it('shows council names in the table', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /per-service supplier concentration hhi/i })
      const tableEl = within(table)
      // Pendle has highest overall HHI so appears first
      expect(tableEl.getByText(/Pendle/)).toBeInTheDocument()
      expect(tableEl.getByText(/Burnley/)).toBeInTheDocument()
      expect(tableEl.getByText(/Hyndburn/)).toBeInTheDocument()
    })

    it('highlights the current council row with star', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /per-service supplier concentration hhi/i })
      const highlightRows = table.querySelectorAll('.highlight-row')
      expect(highlightRows.length).toBe(1)
    })

    it('shows Overall column header', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /per-service supplier concentration hhi/i })
      expect(within(table).getByText('Overall')).toBeInTheDocument()
    })

    it('renders service category column headers', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /per-service supplier concentration hhi/i })
      const tableEl = within(table)
      // Service categories from mock data: Housing, Environmental, Cultural
      expect(tableEl.getByText('Housing')).toBeInTheDocument()
      expect(tableEl.getByText('Environmental')).toBeInTheDocument()
      expect(tableEl.getByText('Cultural')).toBeInTheDocument()
    })

    it('applies correct CSS classes for HHI concentration levels', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /per-service supplier concentration hhi/i })
      // High concentration cells (>2500)
      const highCells = table.querySelectorAll('.hhi-high')
      expect(highCells.length).toBeGreaterThan(0)
      // Low concentration cells (<1500)
      const lowCells = table.querySelectorAll('.hhi-low')
      expect(lowCells.length).toBeGreaterThan(0)
    })

    it('shows dash for councils missing a service category', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /per-service supplier concentration hhi/i })
      // Rossendale has no 'Cultural' HHI data
      const naCells = table.querySelectorAll('.hhi-na')
      expect(naCells.length).toBeGreaterThan(0)
    })

    it('does not render when no councils have service_hhi', () => {
      const noHhiData = {
        councils: mockRichData.councils.map(c => ({ ...c, service_hhi: undefined })),
        generated: '2025-02-01',
      }
      useData.mockReturnValue({ data: noHhiData, loading: false, error: null })
      renderComponent()
      expect(screen.queryByText('Supplier Concentration by Service')).not.toBeInTheDocument()
    })
  })

  // --- CEO Pay Comparison Table ---
  describe('CEO pay comparison table', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
    })

    it('renders the CEO pay heading', () => {
      renderComponent()
      expect(screen.getByText('Chief Executive Pay')).toBeInTheDocument()
    })

    it('renders the pay table with correct aria-label', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /cross-council ceo pay comparison/i })
      expect(table).toBeInTheDocument()
    })

    it('shows column headers for salary, ratio, and median', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /cross-council ceo pay comparison/i })
      const tableEl = within(table)
      expect(tableEl.getByText('CEO Salary Midpoint')).toBeInTheDocument()
      expect(tableEl.getByText('CEO:Median Ratio')).toBeInTheDocument()
      expect(tableEl.getByText('Median Employee Pay')).toBeInTheDocument()
    })

    it('highlights the current council row', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /cross-council ceo pay comparison/i })
      const highlightRows = table.querySelectorAll('.highlight-row')
      expect(highlightRows.length).toBe(1)
    })

    it('shows CEO:median ratio formatted with :1 suffix', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /cross-council ceo pay comparison/i })
      expect(within(table).getByText('5.2:1')).toBeInTheDocument()
      expect(within(table).getByText('4.8:1')).toBeInTheDocument()
    })

    it('does not render when no councils have pay data', () => {
      const noPayData = {
        councils: mockRichData.councils.map(c => ({ ...c, pay: undefined })),
        generated: '2025-02-01',
      }
      useData.mockReturnValue({ data: noPayData, loading: false, error: null })
      renderComponent()
      expect(screen.queryByText('Chief Executive Pay')).not.toBeInTheDocument()
    })
  })

  // --- Duplicate Payments Section ---
  describe('Duplicate payments section', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
    })

    it('renders the duplicate payments heading', () => {
      renderComponent()
      expect(screen.getByText('Potential Duplicate Payments (Annualized)')).toBeInTheDocument()
    })

    it('renders the duplicate payments chart with aria-label', () => {
      renderComponent()
      const chart = screen.getByRole('img', { name: /bar chart comparing potential duplicate payment values/i })
      expect(chart).toBeInTheDocument()
    })

    it('shows per-year count and total count stats', () => {
      renderComponent()
      const dupeStats = document.querySelectorAll('.dupe-count')
      const dupeTexts = Array.from(dupeStats).map(el => el.textContent)
      // Burnley: 45/5 = 9/year, 45 total over 5yr
      expect(dupeTexts.some(t => t.includes('~9 / year') && t.includes('45 total over 5yr'))).toBe(true)
      // Pendle: 67/5 = ~13/year, 67 total
      expect(dupeTexts.some(t => t.includes('~13 / year') && t.includes('67 total over 5yr'))).toBe(true)
    })

    it('renders dupe stat entries for all councils', () => {
      renderComponent()
      const dupeStats = document.querySelectorAll('.dupe-stat')
      expect(dupeStats.length).toBe(4)
    })
  })

  // --- Shared Suppliers Section ---
  describe('Shared suppliers section', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
    })

    it('renders the shared suppliers heading', () => {
      renderComponent()
      expect(screen.getByText('Shared Suppliers Across Councils')).toBeInTheDocument()
    })

    it('renders the shared suppliers table with aria-label', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /shared suppliers across councils/i })
      expect(table).toBeInTheDocument()
    })

    it('shows supplier names in the table', () => {
      renderComponent()
      expect(screen.getByText('BIFFA WASTE SERVICES')).toBeInTheDocument()
      expect(screen.getByText('LIBERATA UK LTD')).toBeInTheDocument()
    })

    it('filters out UNKNOWN supplier', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /shared suppliers across councils/i })
      const rows = table.querySelectorAll('tbody tr')
      const supplierNames = Array.from(rows).map(r => r.querySelector('td')?.textContent)
      expect(supplierNames).not.toContain('UNKNOWN')
    })

    it('filters out suppliers with only 1 council', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /shared suppliers across councils/i })
      const rows = table.querySelectorAll('tbody tr')
      const supplierNames = Array.from(rows).map(r => r.querySelector('td')?.textContent)
      expect(supplierNames).not.toContain('SOLO COUNCIL LTD')
    })

    it('shows councils count for shared suppliers', () => {
      renderComponent()
      const table = screen.getByRole('table', { name: /shared suppliers across councils/i })
      const countCells = table.querySelectorAll('.shared-supplier-count')
      expect(countCells.length).toBe(2) // BIFFA and LIBERATA
    })

    it('shows top council breakdowns per supplier', () => {
      renderComponent()
      // BIFFA has 4 councils but only top 3 shown + "+1 more"
      expect(screen.getByText('+1 more')).toBeInTheDocument()
    })

    it('does not render when no shared suppliers exist', () => {
      const noSharedData = {
        ...mockRichData,
        supplier_index: { shared_suppliers: [] },
      }
      useData.mockReturnValue({ data: noSharedData, loading: false, error: null })
      renderComponent()
      expect(screen.queryByText('Shared Suppliers Across Councils')).not.toBeInTheDocument()
    })

    it('renders supplier links to supplier profile pages', () => {
      renderComponent()
      const links = screen.getAllByRole('link')
      const supplierLinks = links.filter(l => l.getAttribute('href')?.startsWith('/supplier/'))
      expect(supplierLinks.length).toBe(2)
    })
  })

  // --- Data Quality Warnings ---
  describe('Data quality warnings', () => {
    it('shows data quality warning for councils missing service expenditure', () => {
      useData.mockReturnValue({ data: mockMissingDataCouncils, loading: false, error: null })
      renderComponent()
      const qualityBanner = document.querySelector('.cross-quality-warning')
      expect(qualityBanner).not.toBeNull()
      expect(qualityBanner.textContent).toMatch(/Wyre/)
      expect(qualityBanner.textContent).toMatch(/incomplete service expenditure data/)
    })

    it('shows data quality warning for councils missing budget summary', () => {
      useData.mockReturnValue({ data: mockMissingDataCouncils, loading: false, error: null })
      renderComponent()
      const qualityBanner = document.querySelector('.cross-quality-warning')
      expect(qualityBanner).not.toBeNull()
      expect(qualityBanner.textContent).toMatch(/missing GOV\.UK budget summary data/)
    })

    it('shows low data confidence banner when council has fewer than 5000 records', () => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
      renderComponent()
      // Rossendale has 2,500 records (< 5000)
      const banners = document.querySelectorAll('.cross-data-banner')
      expect(banners.length).toBeGreaterThan(0)
      const bannerTexts = Array.from(banners).map(b => b.textContent)
      expect(bannerTexts.some(t => t.includes('Data comparability note'))).toBe(true)
      expect(bannerTexts.some(t => t.includes('Rossendale') && t.includes('2,500 records'))).toBe(true)
    })

    it('does not show data confidence banner when all councils have sufficient data', () => {
      const goodData = {
        councils: mockRichData.councils.map(c => ({
          ...c,
          total_records: 10000,
        })),
        generated: '2025-02-01',
      }
      useData.mockReturnValue({ data: goodData, loading: false, error: null })
      renderComponent()
      expect(screen.queryByText(/Data comparability note/)).not.toBeInTheDocument()
    })
  })

  // --- Empty / No Data States ---
  describe('Empty councils state', () => {
    it('renders "no data" message when councils array is empty', () => {
      useData.mockReturnValue({
        data: { councils: [], generated: '2025-02-01' },
        loading: false,
        error: null,
      })
      renderComponent()
      expect(screen.getByText(/no cross-council comparison data available/i)).toBeInTheDocument()
    })

    it('renders "no data" message when comparison has no councils key', () => {
      useData.mockReturnValue({
        data: { generated: '2025-02-01' },
        loading: false,
        error: null,
      })
      renderComponent()
      expect(screen.getByText(/no cross-council comparison data available/i)).toBeInTheDocument()
    })
  })

  // --- Transparency Scorecard ---
  describe('Transparency scorecard', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
    })

    it('renders the transparency heading', () => {
      renderComponent()
      expect(screen.getByText('Transparency Scorecard')).toBeInTheDocument()
    })

    it('renders scorecard cards for all councils', () => {
      renderComponent()
      const cards = document.querySelectorAll('.scorecard-card')
      expect(cards.length).toBe(4)
    })

    it('highlights current council scorecard', () => {
      renderComponent()
      const currentCards = document.querySelectorAll('.scorecard-card.current')
      expect(currentCards.length).toBe(1)
    })

    it('shows Dates, Suppliers, and Departments score bars', () => {
      renderComponent()
      const dateLabels = screen.getAllByText('Dates')
      const supplierLabels = screen.getAllByText('Suppliers')
      const deptLabels = screen.getAllByText('Departments')
      // One per council (4 councils)
      expect(dateLabels.length).toBe(4)
      expect(supplierLabels.length).toBe(4)
      expect(deptLabels.length).toBe(4)
    })

    it('shows percentage values for score bars', () => {
      renderComponent()
      // Burnley: 100%, 95%, 80%
      expect(screen.getByText('100%')).toBeInTheDocument()
      expect(screen.getByText('95%')).toBeInTheDocument()
    })
  })

  // --- Methodology Note ---
  describe('Methodology section', () => {
    beforeEach(() => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
    })

    it('renders methodology heading', () => {
      renderComponent()
      expect(screen.getByText(/Methodology & Data Coverage/)).toBeInTheDocument()
    })

    it('shows generated date', () => {
      renderComponent()
      expect(screen.getByText(/Comparison generated: 2025-02-01/)).toBeInTheDocument()
    })

    it('shows data period for each council', () => {
      renderComponent()
      // Burnley: 2019-20 to 2023-24 (5 years) listed in methodology
      const methodology = document.querySelector('.methodology-note')
      expect(methodology).not.toBeNull()
      expect(methodology.textContent).toContain('2019-20')
      expect(methodology.textContent).toContain('2023-24')
    })
  })

  // --- Document Title ---
  describe('Document title', () => {
    it('sets document title on mount', () => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
      renderComponent()
      expect(document.title).toContain('Cross-Council Comparison')
      expect(document.title).toContain('Burnley')
    })
  })

  // --- Hero Subtitle ---
  describe('Hero subtitle', () => {
    it('includes council name in subtitle text', () => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
      renderComponent()
      expect(screen.getByText(/Burnley is highlighted throughout/)).toBeInTheDocument()
    })

    it('shows correct council count in subtitle', () => {
      useData.mockReturnValue({ data: mockRichData, loading: false, error: null })
      renderComponent()
      const subtitle = document.querySelector('.hero-subtitle')
      expect(subtitle.textContent).toMatch(/4 district councils/)
    })
  })
})
