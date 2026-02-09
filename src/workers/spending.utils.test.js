import { describe, it, expect } from 'vitest'
import {
  typeLabel,
  buildFilterOptions,
  filterRecords,
  sortRecords,
  computeAll,
  generateCSV,
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
    expect(lines[0]).toBe('"Date","Supplier","Amount","Type","Service","Category","Org Unit","Transaction"')
    expect(lines).toHaveLength(4) // header + 3 data rows
    expect(lines[1]).toContain('ACME Corp')
  })

  it('handles empty records', () => {
    const csv = generateCSV([])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(1) // header only
  })
})
