import { describe, it, expect } from 'vitest'
import {
  typeLabel,
  buildFilterOptions,
  filterRecords,
  sortRecords,
  computeAll,
  generateCSV,
  hydrateRecord,
  RECORD_DEFAULTS,
  SPEND_CATEGORIES,
  classifySpendCategory,
  computeSpendingSummary,
} from './spending.utils'

const mockRecords = [
  {
    date: '2025-01-15',
    financial_year: '2024/25',
    quarter: 4,
    supplier: 'ACME Corp',
    amount: 5000,
    type: 'spend',
    service_division: 'Finance - Accounting',
    expenditure_category: 'Consulting',
    capital_revenue: 'Revenue',
    organisational_unit: 'Finance Dept',
    transaction_number: 'TX001',
    is_covid_related: false,
  },
  {
    date: '2025-02-01',
    financial_year: '2024/25',
    quarter: 4,
    supplier: 'Widget Ltd',
    amount: 2500,
    type: 'contracts',
    service_division: 'IT - Software',
    expenditure_category: 'Software',
    capital_revenue: 'Revenue',
    organisational_unit: 'IT Dept',
    transaction_number: 'TX002',
    is_covid_related: true,
  },
  {
    date: '2024-06-10',
    financial_year: '2024/25',
    quarter: 1,
    supplier: 'ACME Corp',
    amount: 10000,
    type: 'spend',
    service_division: 'Finance - Accounting',
    expenditure_category: 'Consulting',
    capital_revenue: 'Capital',
    organisational_unit: 'Finance Dept',
    transaction_number: 'TX003',
    is_covid_related: false,
  },
]

describe('typeLabel', () => {
  it('returns label for known types', () => {
    expect(typeLabel('spend')).toBe('Spend')
    expect(typeLabel('contracts')).toBe('Contracts')
    expect(typeLabel('purchase_cards')).toBe('Purchase Cards')
  })

  it('returns raw value for unknown types', () => {
    expect(typeLabel('other')).toBe('other')
    expect(typeLabel('custom')).toBe('custom')
  })
})

describe('buildFilterOptions', () => {
  it('extracts unique filter values', () => {
    const options = buildFilterOptions(mockRecords)
    expect(options.financial_years).toEqual(['2024/25'])
    expect(options.types).toEqual(['contracts', 'spend'])
    expect(options.suppliers).toEqual(['ACME Corp', 'Widget Ltd'])
    expect(options.expenditure_categories).toEqual(['Consulting', 'Software'])
    expect(options.capital_revenue).toEqual(['Capital', 'Revenue'])
    expect(options.quarters).toEqual(['Q1', 'Q2', 'Q3', 'Q4'])
  })

  it('handles empty array', () => {
    const options = buildFilterOptions([])
    expect(options.financial_years).toEqual([])
    expect(options.suppliers).toEqual([])
    expect(options.quarters).toEqual(['Q1', 'Q2', 'Q3', 'Q4'])
  })

  it('handles records with null/undefined fields', () => {
    const options = buildFilterOptions([{ date: null, supplier: undefined, type: '' }])
    expect(options.suppliers).toEqual([])
    expect(options.types).toEqual([])
  })
})

describe('filterRecords', () => {
  it('returns all records with no filters', () => {
    const result = filterRecords(mockRecords, {}, '')
    expect(result).toHaveLength(3)
  })

  it('filters by text search', () => {
    const result = filterRecords(mockRecords, {}, 'ACME')
    expect(result).toHaveLength(2)
    expect(result.every(r => r.supplier === 'ACME Corp')).toBe(true)
  })

  it('filters by financial year', () => {
    const result = filterRecords(mockRecords, { financial_year: '2024/25' }, '')
    expect(result).toHaveLength(3)
  })

  it('filters by quarter', () => {
    const result = filterRecords(mockRecords, { quarter: 'Q1' }, '')
    expect(result).toHaveLength(1)
    expect(result[0].transaction_number).toBe('TX003')
  })

  it('filters by type', () => {
    const result = filterRecords(mockRecords, { type: 'contracts' }, '')
    expect(result).toHaveLength(1)
    expect(result[0].supplier).toBe('Widget Ltd')
  })

  it('filters by min amount', () => {
    const result = filterRecords(mockRecords, { min_amount: '3000' }, '')
    expect(result).toHaveLength(2)
  })

  it('filters by max amount', () => {
    const result = filterRecords(mockRecords, { max_amount: '3000' }, '')
    expect(result).toHaveLength(1)
    expect(result[0].supplier).toBe('Widget Ltd')
  })

  it('combines multiple filters', () => {
    const result = filterRecords(mockRecords, { type: 'spend', supplier: 'ACME Corp' }, '')
    expect(result).toHaveLength(2)
  })

  it('search + filter combined', () => {
    const result = filterRecords(mockRecords, { type: 'spend' }, 'Widget')
    expect(result).toHaveLength(0) // Widget Ltd is type 'contracts', not 'spend'
  })
})

describe('sortRecords', () => {
  it('sorts by date descending (default)', () => {
    const result = sortRecords(mockRecords, 'date', 'desc')
    expect(result[0].transaction_number).toBe('TX002') // Feb 2025
    expect(result[1].transaction_number).toBe('TX001') // Jan 2025
    expect(result[2].transaction_number).toBe('TX003') // Jun 2024
  })

  it('sorts by amount ascending', () => {
    const result = sortRecords(mockRecords, 'amount', 'asc')
    expect(result[0].amount).toBe(2500)
    expect(result[1].amount).toBe(5000)
    expect(result[2].amount).toBe(10000)
  })

  it('sorts by supplier alphabetically', () => {
    const result = sortRecords(mockRecords, 'supplier', 'asc')
    expect(result[0].supplier).toBe('ACME Corp')
    expect(result[2].supplier).toBe('Widget Ltd')
  })

  it('does not mutate original array', () => {
    const original = [...mockRecords]
    sortRecords(mockRecords, 'amount', 'asc')
    expect(mockRecords).toEqual(original)
  })
})

describe('computeAll', () => {
  it('computes correct stats', () => {
    const { stats } = computeAll(mockRecords)
    expect(stats.total).toBe(17500) // 5000 + 2500 + 10000
    expect(stats.count).toBe(3)
    expect(stats.suppliers).toBe(2) // ACME Corp, Widget Ltd
    expect(stats.avgTransaction).toBeCloseTo(5833.33, 0)
    expect(stats.medianAmount).toBe(5000)
    expect(stats.maxTransaction).toBe(10000)
  })

  it('computes standard deviation', () => {
    const { stats } = computeAll(mockRecords)
    expect(stats.stdDev).toBeGreaterThan(0)
    // Known values: [2500, 5000, 10000] → sample stddev ≈ 3818.81
    expect(stats.stdDev).toBeCloseTo(3818.81, 0)
  })

  it('computes percentiles from sorted amounts', () => {
    const { stats } = computeAll(mockRecords)
    // With 3 sorted values [2500, 5000, 10000]:
    expect(stats.p10).toBeGreaterThanOrEqual(2500)
    expect(stats.p25).toBeGreaterThanOrEqual(2500)
    expect(stats.p75).toBeLessThanOrEqual(10000)
    expect(stats.p90).toBeLessThanOrEqual(10000)
    // Ordering: p10 ≤ p25 ≤ median ≤ p75 ≤ p90
    expect(stats.p10).toBeLessThanOrEqual(stats.p25)
    expect(stats.p25).toBeLessThanOrEqual(stats.medianAmount)
    expect(stats.medianAmount).toBeLessThanOrEqual(stats.p75)
    expect(stats.p75).toBeLessThanOrEqual(stats.p90)
  })

  it('computes supplier Gini coefficient', () => {
    const { stats } = computeAll(mockRecords)
    // 2 suppliers: ACME=15000, Widget=2500 → significant inequality
    expect(stats.supplierGini).toBeGreaterThan(0)
    expect(stats.supplierGini).toBeLessThan(1)
  })

  it('returns zero stats for empty input', () => {
    const { stats } = computeAll([])
    expect(stats.stdDev).toBe(0)
    expect(stats.p10).toBe(0)
    expect(stats.p25).toBe(0)
    expect(stats.p75).toBe(0)
    expect(stats.p90).toBe(0)
    expect(stats.supplierGini).toBe(0)
  })

  it('computes type breakdown', () => {
    const { stats } = computeAll(mockRecords)
    expect(stats.byType.spend).toBe(15000) // 5000 + 10000
    expect(stats.byType.contracts).toBe(2500)
  })

  it('computes chart data', () => {
    const { chartData } = computeAll(mockRecords)
    expect(chartData.yearData).toHaveLength(1) // All 2024/25
    expect(chartData.yearData[0].year).toBe('2024/25')
    expect(chartData.yearData[0].amount).toBe(17500)

    expect(chartData.categoryData).toHaveLength(2) // Consulting, Software
    expect(chartData.supplierData).toHaveLength(2) // ACME, Widget
    expect(chartData.typeData).toHaveLength(2) // spend, contracts
  })

  it('handles empty array', () => {
    const { stats, chartData } = computeAll([])
    expect(stats.total).toBe(0)
    expect(stats.count).toBe(0)
    expect(stats.medianAmount).toBe(0)
    expect(chartData.yearData).toEqual([])
    expect(chartData.monthlyData).toEqual([])
  })

  it('computes monthly data with rolling average', () => {
    const { chartData } = computeAll(mockRecords)
    expect(chartData.monthlyData.length).toBeGreaterThan(0)
    // Each monthly entry should have an avg field
    chartData.monthlyData.forEach(m => {
      expect(m).toHaveProperty('avg')
      expect(m).toHaveProperty('amount')
      expect(m).toHaveProperty('label')
    })
  })
})

describe('generateCSV', () => {
  it('generates valid CSV string', () => {
    const csv = generateCSV(mockRecords)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('"Date","Supplier","Amount","Type","Service","Category","Spend Category","Org Unit","Transaction"')
    expect(lines).toHaveLength(4) // header + 3 data rows
    expect(lines[1]).toContain('ACME Corp')
  })

  it('handles empty records', () => {
    const csv = generateCSV([])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(1) // header only
  })
})

describe('hydrateRecord', () => {
  it('fills defaults for stripped fields', () => {
    // Simulates a real stripped LCC record:
    // - department stripped (matched department_raw)
    // - service_area stripped (matched service_area_raw)
    // - council, month, supplier_canonical, description, capital_revenue etc. all stripped
    const stripped = {
      date: '2025-01-15',
      supplier: 'ACME Corp',
      amount: 5000,
      financial_year: '2024/25',
      quarter: 4,
      department_raw: 'Finance',
      service_area_raw: 'Consulting',
      service_division: 'Finance',
      expenditure_category: 'Consulting',
    }
    const hydrated = hydrateRecord(stripped, 'lancashire_cc')
    expect(hydrated.council).toBe('lancashire_cc')
    expect(hydrated.supplier_canonical).toBe('ACME Corp')
    expect(hydrated.department).toBe('Finance')
    expect(hydrated.department_raw).toBe('Finance')
    expect(hydrated.service_area).toBe('Consulting')
    expect(hydrated.service_area_raw).toBe('Consulting')
    expect(hydrated.description).toBe('')
    expect(hydrated.capital_revenue).toBeNull()
    expect(hydrated.supplier_company_number).toBeNull()
    expect(hydrated.supplier_company_url).toBeNull()
    expect(hydrated.month).toBe(1)
    expect(hydrated.type).toBe('spend')
  })

  it('preserves explicit values over defaults', () => {
    const stripped = {
      date: '2025-03-20',
      supplier: 'Test Ltd',
      amount: 1000,
      type: 'grant',
      capital_revenue: 'Capital',
      description: 'A real description',
      supplier_company_number: '12345678',
    }
    const hydrated = hydrateRecord(stripped, 'blackpool')
    expect(hydrated.type).toBe('grant')
    expect(hydrated.capital_revenue).toBe('Capital')
    expect(hydrated.description).toBe('A real description')
    expect(hydrated.supplier_company_number).toBe('12345678')
    expect(hydrated.council).toBe('blackpool')
  })

  it('restores SPA compatibility aliases', () => {
    const stripped = {
      date: '2025-06-10',
      supplier: 'Vendor',
      amount: 500,
      department_raw: 'Adult Services',
      service_area_raw: 'Domiciliary Care',
    }
    const hydrated = hydrateRecord(stripped, 'blackburn')
    // service_division should be populated from department_raw
    expect(hydrated.service_division).toBe('Adult Services')
    // expenditure_category should be populated from service_area_raw
    expect(hydrated.expenditure_category).toBe('Domiciliary Care')
    // department should be populated from department_raw
    expect(hydrated.department).toBe('Adult Services')
    // service_area should be populated from service_area_raw
    expect(hydrated.service_area).toBe('Domiciliary Care')
  })

  it('exports RECORD_DEFAULTS as expected', () => {
    expect(RECORD_DEFAULTS.supplier_canonical).toBeNull()
    expect(RECORD_DEFAULTS.description).toBe('')
    expect(RECORD_DEFAULTS.type).toBe('spend')
  })

  it('classifies spend category during hydration', () => {
    const stripped = {
      date: '2025-01-15',
      supplier: 'Test',
      amount: 1000,
      department_raw: 'Adult Social Care - Residential',
    }
    const hydrated = hydrateRecord(stripped, 'lancashire_cc')
    expect(hydrated.spend_category).toBe('adult_social_care')
    expect(hydrated.spend_category_label).toBe('Adult Social Care')
  })
})

describe('SPEND_CATEGORIES', () => {
  it('contains 13 categories', () => {
    expect(Object.keys(SPEND_CATEGORIES)).toHaveLength(13)
  })

  it('has expected category keys', () => {
    expect(SPEND_CATEGORIES.adult_social_care).toBe('Adult Social Care')
    expect(SPEND_CATEGORIES.children_services).toBe("Children's Services")
    expect(SPEND_CATEGORIES.education_skills).toBe('Education & Skills')
    expect(SPEND_CATEGORIES.highways_transport).toBe('Highways & Transport')
    expect(SPEND_CATEGORIES.resources).toBe('Resources & Corporate')
    expect(SPEND_CATEGORIES.other).toBe('Other / Unclassified')
  })
})

describe('classifySpendCategory', () => {
  it('classifies adult social care departments', () => {
    const result = classifySpendCategory({ department_raw: 'Adult Social Care - Residential' })
    expect(result.category).toBe('adult_social_care')
    expect(result.confidence).toBe('high')
  })

  it('classifies children services', () => {
    const result = classifySpendCategory({ department_raw: "Children's Services - Fostering" })
    expect(result.category).toBe('children_services')
    expect(result.confidence).toBe('high')
  })

  it('classifies education', () => {
    const result = classifySpendCategory({ department_raw: 'Education - SEND' })
    expect(result.category).toBe('education_skills')
    expect(result.confidence).toBe('high')
  })

  it('classifies highways', () => {
    const result = classifySpendCategory({ department_raw: 'Highways - Road Maintenance' })
    expect(result.category).toBe('highways_transport')
    expect(result.confidence).toBe('high')
  })

  it('classifies environment', () => {
    const result = classifySpendCategory({ department_raw: 'Waste Management' })
    expect(result.category).toBe('environment_communities')
    expect(result.confidence).toBe('high')
  })

  it('classifies public health', () => {
    const result = classifySpendCategory({ department_raw: 'Public Health - Substance Misuse' })
    expect(result.category).toBe('public_health')
    expect(result.confidence).toBe('high')
  })

  it('classifies resources/corporate', () => {
    const result = classifySpendCategory({ department_raw: 'Finance - Treasury' })
    expect(result.category).toBe('resources')
    expect(result.confidence).toBe('high')
  })

  it('classifies ICT/digital', () => {
    const result = classifySpendCategory({ department_raw: 'ICT - Software' })
    expect(result.category).toBe('ict_digital')
    expect(result.confidence).toBe('high')
  })

  it('classifies economic development', () => {
    const result = classifySpendCategory({ department_raw: 'Economic Development' })
    expect(result.category).toBe('economic_development')
    expect(result.confidence).toBe('high')
  })

  it('classifies leader/cabinet office', () => {
    const result = classifySpendCategory({ department_raw: 'Chief Executive Office' })
    expect(result.category).toBe('leader_cabinet')
    expect(result.confidence).toBe('high')
  })

  it('falls back to expenditure category patterns (tier 2)', () => {
    const result = classifySpendCategory({ department_raw: 'Unknown Dept', expenditure_category: 'Domiciliary Care Services' })
    expect(result.category).toBe('adult_social_care')
    expect(result.confidence).toBe('medium')
  })

  it('detects school names via heuristic (tier 3)', () => {
    const result = classifySpendCategory({ department_raw: 'Burnley High School Academy' })
    expect(result.category).toBe('schools_delegated')
    expect(result.confidence).toBe('medium')
  })

  it('classifies capital by revenue indicator', () => {
    const result = classifySpendCategory({ department_raw: 'Unknown', capital_revenue: 'Capital' })
    expect(result.category).toBe('capital_projects')
    expect(result.confidence).toBe('low')
  })

  it('returns other for unclassifiable records', () => {
    const result = classifySpendCategory({ department_raw: 'XYZ Miscellaneous' })
    expect(result.category).toBe('other')
    expect(result.confidence).toBe('low')
  })

  it('handles empty/missing fields gracefully', () => {
    const result = classifySpendCategory({})
    expect(result.category).toBe('other')
    expect(result.category_label).toBe('Other / Unclassified')
  })

  it('returns correct label for each category', () => {
    const result = classifySpendCategory({ department_raw: 'Adult Social Care' })
    expect(result.category_label).toBe(SPEND_CATEGORIES[result.category])
  })

  it('uses service_division as fallback for department', () => {
    const result = classifySpendCategory({ service_division: 'Children - Safeguarding' })
    expect(result.category).toBe('children_services')
  })
})

describe('computeSpendingSummary', () => {
  const summaryRecords = [
    { date: '2025-01-15', supplier: 'Acme', amount: 5000, spend_category: 'adult_social_care', spend_category_label: 'Adult Social Care', service_division: 'ASC', department_raw: 'ASC' },
    { date: '2025-01-20', supplier: 'Acme', amount: 3000, spend_category: 'adult_social_care', spend_category_label: 'Adult Social Care', service_division: 'ASC', department_raw: 'ASC' },
    { date: '2025-02-10', supplier: 'Beta', amount: 2000, spend_category: 'highways_transport', spend_category_label: 'Highways & Transport', service_division: 'HT', department_raw: 'HT' },
    { date: '2025-02-15', supplier: 'Beta', amount: -500, spend_category: 'highways_transport', spend_category_label: 'Highways & Transport', service_division: 'HT', department_raw: 'HT' },
    { date: '2025-03-01', supplier: 'Gamma', amount: 1000, spend_category: 'other', spend_category_label: 'Other / Unclassified', service_division: 'Other', department_raw: 'Other' },
  ]

  it('returns null for empty input', () => {
    expect(computeSpendingSummary([])).toBeNull()
    expect(computeSpendingSummary(null)).toBeNull()
  })

  it('computes correct totals', () => {
    const s = computeSpendingSummary(summaryRecords)
    expect(s.total_spend).toBe(11000) // 5000+3000+2000+1000
    expect(s.total_income).toBe(-500)
    expect(s.record_count).toBe(5)
  })

  it('computes coverage stats', () => {
    const s = computeSpendingSummary(summaryRecords)
    expect(s.coverage.classified).toBe(4) // asc(2) + ht(2)
    expect(s.coverage.unclassified).toBe(1) // other
    expect(s.coverage.pct).toBe(80) // 4/5 * 100
  })

  it('aggregates by portfolio/category', () => {
    const s = computeSpendingSummary(summaryRecords)
    expect(Object.keys(s.by_portfolio)).toHaveLength(3) // asc, ht, other
    expect(s.by_portfolio.adult_social_care.total).toBe(8000)
    expect(s.by_portfolio.adult_social_care.count).toBe(2)
    expect(s.by_portfolio.adult_social_care.unique_suppliers).toBe(1)
    expect(s.by_portfolio.highways_transport.total).toBe(2000)
    expect(s.by_portfolio.highways_transport.income).toBe(-500)
  })

  it('computes monthly breakdown', () => {
    const s = computeSpendingSummary(summaryRecords)
    expect(s.by_month.length).toBeGreaterThan(0)
    const jan = s.by_month.find(m => m.month === '2025-01')
    expect(jan).toBeDefined()
    expect(jan.total).toBe(8000)
    expect(jan.count).toBe(2)
  })

  it('computes top suppliers', () => {
    const s = computeSpendingSummary(summaryRecords)
    expect(s.top_suppliers.length).toBeGreaterThan(0)
    expect(s.top_suppliers[0].name).toBe('Acme')
    expect(s.top_suppliers[0].total).toBe(8000) // 5000+3000
  })

  it('computes top departments', () => {
    const s = computeSpendingSummary(summaryRecords)
    expect(s.top_departments.length).toBeGreaterThan(0)
    expect(s.top_departments[0].name).toBe('ASC')
  })

  it('computes HHI per portfolio', () => {
    const s = computeSpendingSummary(summaryRecords)
    // adult_social_care has only 1 supplier (Acme) → HHI = 10000 (monopoly)
    expect(s.by_portfolio.adult_social_care.hhi).toBe(10000)
  })

  it('computes top suppliers per portfolio', () => {
    const s = computeSpendingSummary(summaryRecords)
    const ascSuppliers = s.by_portfolio.adult_social_care.top_suppliers
    expect(ascSuppliers).toBeDefined()
    expect(ascSuppliers.length).toBe(1)
    expect(ascSuppliers[0].name).toBe('Acme')
  })

  it('computes monthly trends per portfolio', () => {
    const s = computeSpendingSummary(summaryRecords)
    const ascMonths = s.by_portfolio.adult_social_care.by_month
    expect(ascMonths.length).toBe(1) // only Jan
    expect(ascMonths[0].month).toBe('2025-01')
  })
})

describe('buildFilterOptions — spend_categories', () => {
  it('includes spend_categories in filter options', () => {
    const records = [
      { ...mockRecords[0], spend_category_label: 'Adult Social Care' },
      { ...mockRecords[1], spend_category_label: 'Highways & Transport' },
      { ...mockRecords[2], spend_category_label: 'Adult Social Care' },
    ]
    const opts = buildFilterOptions(records)
    expect(opts.spend_categories).toBeDefined()
    expect(opts.spend_categories).toContain('Adult Social Care')
    expect(opts.spend_categories).toContain('Highways & Transport')
    expect(opts.spend_categories).toHaveLength(2)
  })
})

describe('filterRecords — spend_category', () => {
  const catRecords = [
    { ...mockRecords[0], spend_category: 'adult_social_care', spend_category_label: 'Adult Social Care' },
    { ...mockRecords[1], spend_category: 'highways_transport', spend_category_label: 'Highways & Transport' },
    { ...mockRecords[2], spend_category: 'adult_social_care', spend_category_label: 'Adult Social Care' },
  ]

  it('filters by spend_category', () => {
    const result = filterRecords(catRecords, { spend_category: 'Adult Social Care' }, '')
    expect(result).toHaveLength(2)
  })

  it('returns all when no spend_category filter', () => {
    const result = filterRecords(catRecords, {}, '')
    expect(result).toHaveLength(3)
  })
})

describe('computeAll — spendCategoryData', () => {
  it('includes spendCategoryData in chart data', () => {
    const records = [
      { ...mockRecords[0], spend_category: 'adult_social_care', spend_category_label: 'Adult Social Care' },
      { ...mockRecords[1], spend_category: 'highways_transport', spend_category_label: 'Highways & Transport' },
    ]
    const { chartData } = computeAll(records)
    expect(chartData.spendCategoryData).toBeDefined()
    expect(chartData.spendCategoryData.length).toBe(2)
    expect(chartData.spendCategoryData[0]).toHaveProperty('name')
    expect(chartData.spendCategoryData[0]).toHaveProperty('value')
  })
})
