/**
 * Pure computation functions for spending data.
 * Used by the spending Web Worker. Fully testable without Worker context.
 */

import { SPENDING_TYPE_LABELS } from '../utils/constants'

export function typeLabel(t) {
  return SPENDING_TYPE_LABELS[t] || t
}

/**
 * Default values for fields stripped by v4 ETL to save bytes.
 * These are the most common null/empty values across all councils.
 */
export const RECORD_DEFAULTS = {
  supplier_canonical: null,
  department: null,
  department_raw: '',
  service_area: '',
  service_area_raw: '',
  service_division: '',
  expenditure_category: '',
  description: '',
  reference: '',
  capital_revenue: null,
  supplier_company_number: null,
  supplier_company_url: null,
  type: 'spend',
}

/**
 * Hydrate a stripped record by filling in default values for missing fields
 * and restoring duplicate fields (supplier_canonical, department, etc.).
 *
 * v4 monthly chunks omit null/empty/duplicate fields to save ~42-45% file size.
 * This function restores the full record shape expected by filterRecords/computeAll.
 *
 * @param {object} r - Stripped record from v4 chunk
 * @param {string} councilId - Council ID to restore (stripped from records)
 * @returns {object} Fully hydrated record matching v2/v3 shape
 */
export function hydrateRecord(r, councilId) {
  const h = { ...RECORD_DEFAULTS, ...r }
  // Restore council (stripped since it's the same for every record)
  h.council = councilId
  // Restore month integer from date
  if (h.month == null && h.date) {
    h.month = parseInt(h.date.substring(5, 7), 10)
  }
  // Restore duplicate fields — these were stripped when they matched their source
  if (h.supplier_canonical == null && h.supplier) h.supplier_canonical = h.supplier
  if (!h.department && h.department_raw) h.department = h.department_raw
  if (!h.department && h.service_division) h.department = h.service_division
  if (!h.service_area && h.service_area_raw) h.service_area = h.service_area_raw
  if (!h.service_area && h.expenditure_category) h.service_area = h.expenditure_category
  // Ensure SPA compatibility aliases are populated
  if (!h.service_division && h.department) h.service_division = h.department
  if (!h.service_division && h.department_raw) h.service_division = h.department_raw
  if (!h.expenditure_category && h.service_area) h.expenditure_category = h.service_area
  if (!h.expenditure_category && h.service_area_raw) h.expenditure_category = h.service_area_raw
  return h
}

/**
 * Build unique filter option sets from records.
 * Scans entire dataset once — expensive on 50k records, so we do this
 * either at ETL time (v2 format) or once on INIT in the worker.
 */
export function buildFilterOptions(records) {
  const sets = {
    financial_years: new Set(),
    types: new Set(),
    service_divisions: new Set(),
    expenditure_categories: new Set(),
    capital_revenue: new Set(),
    suppliers: new Set(),
    months: new Set(),
  }

  for (const r of records) {
    if (r.financial_year) sets.financial_years.add(r.financial_year)
    if (r.type) sets.types.add(r.type)
    if (r.service_division) sets.service_divisions.add(r.service_division)
    if (r.expenditure_category) sets.expenditure_categories.add(r.expenditure_category)
    if (r.capital_revenue) sets.capital_revenue.add(r.capital_revenue)
    if (r.supplier) sets.suppliers.add(r.supplier)
    if (r.date) {
      const d = new Date(r.date)
      if (!isNaN(d.getTime())) {
        sets.months.add(d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }))
      }
    }
  }

  return {
    financial_years: [...sets.financial_years].sort(),
    quarters: ['Q1', 'Q2', 'Q3', 'Q4'],
    types: [...sets.types].sort(),
    service_divisions: [...sets.service_divisions].sort(),
    expenditure_categories: [...sets.expenditure_categories].sort(),
    capital_revenue: [...sets.capital_revenue].sort(),
    suppliers: [...sets.suppliers].sort(),
    months: [...sets.months].sort(),
  }
}

/**
 * Filter records by search text and 10 filter dimensions.
 * Mirrors the logic from Spending.jsx lines 141-186.
 */
export function filterRecords(records, filters, search) {
  let result = records

  if (search) {
    const searchLower = search.toLowerCase()
    result = result.filter(item =>
      item.supplier?.toLowerCase().includes(searchLower) ||
      item.organisational_unit?.toLowerCase().includes(searchLower) ||
      item.service_division?.toLowerCase().includes(searchLower) ||
      item.expenditure_category?.toLowerCase().includes(searchLower) ||
      item.transaction_number?.toLowerCase().includes(searchLower)
    )
  }

  if (filters.financial_year) result = result.filter(item => item.financial_year === filters.financial_year)
  if (filters.quarter) {
    const qNum = parseInt(filters.quarter.replace('Q', ''))
    result = result.filter(item => item.quarter === qNum)
  }
  if (filters.month) {
    result = result.filter(item => {
      if (!item.date) return false
      const d = new Date(item.date)
      return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }) === filters.month
    })
  }
  if (filters.type) result = result.filter(item => item.type === filters.type)
  if (filters.service_division) result = result.filter(item => item.service_division === filters.service_division)
  if (filters.expenditure_category) result = result.filter(item => item.expenditure_category === filters.expenditure_category)
  if (filters.capital_revenue) result = result.filter(item => item.capital_revenue === filters.capital_revenue)
  if (filters.supplier) result = result.filter(item => item.supplier === filters.supplier)
  if (filters.min_amount) result = result.filter(item => (item.amount || 0) >= parseFloat(filters.min_amount))
  if (filters.max_amount) result = result.filter(item => (item.amount || 0) <= parseFloat(filters.max_amount))

  return result
}

/**
 * Sort records by field + direction. Returns a new array (never mutates).
 */
export function sortRecords(records, sortField, sortDir) {
  return [...records].sort((a, b) => {
    let aVal = a[sortField], bVal = b[sortField]
    if (sortField === 'amount') { aVal = Number(aVal) || 0; bVal = Number(bVal) || 0 }
    else if (sortField === 'date') { aVal = new Date(aVal || '1970-01-01').getTime(); bVal = new Date(bVal || '1970-01-01').getTime() }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
    return 0
  })
}

/**
 * Single-pass computation of stats + chart aggregation data.
 * Replaces 8+ separate .forEach() loops in the original Spending.jsx.
 */
export function computeAll(filtered) {
  // Stats accumulators
  let total = 0, maxTransaction = 0
  const amounts = []
  const supplierSet = new Set()
  const byType = {}

  // Welford's online variance accumulators (numerically stable)
  let wN = 0, wMean = 0, wM2 = 0

  // Chart aggregation accumulators
  const byYear = {}, byYearCount = {}
  const byCategory = {}
  const byService = {}
  const bySupplier = {}, bySupplierCount = {}
  const byTypeChart = {}
  const byMonth = {}, byMonthCount = {}

  // Single pass over all filtered records
  for (const item of filtered) {
    const amt = Number(item.amount) || 0

    // Stats
    total += amt
    if (amt > maxTransaction) maxTransaction = amt
    amounts.push(amt)
    if (item.supplier) supplierSet.add(item.supplier)

    // Welford's online algorithm for variance
    wN++
    const delta = amt - wMean
    wMean += delta / wN
    const delta2 = amt - wMean
    wM2 += delta * delta2

    const t = item.type || 'other'
    byType[t] = (byType[t] || 0) + amt

    // Chart: by year
    const fy = item.financial_year || 'Unknown'
    byYear[fy] = (byYear[fy] || 0) + amt
    byYearCount[fy] = (byYearCount[fy] || 0) + 1

    // Chart: by category
    const cat = item.expenditure_category || 'Other'
    byCategory[cat] = (byCategory[cat] || 0) + amt

    // Chart: by service
    const svc = item.service_division || 'Other'
    byService[svc] = (byService[svc] || 0) + amt

    // Chart: by supplier
    const sup = item.supplier || 'Unknown'
    bySupplier[sup] = (bySupplier[sup] || 0) + amt
    bySupplierCount[sup] = (bySupplierCount[sup] || 0) + 1

    // Chart: by type
    byTypeChart[t] = (byTypeChart[t] || 0) + amt

    // Chart: by month
    if (item.date) {
      const d = new Date(item.date)
      if (!isNaN(d.getTime())) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        byMonth[key] = (byMonth[key] || 0) + amt
        byMonthCount[key] = (byMonthCount[key] || 0) + 1
      }
    }
  }

  // Median + percentile calculations (amounts already collected, sort once)
  amounts.sort((a, b) => a - b)
  const mid = Math.floor(amounts.length / 2)
  const medianAmount = amounts.length === 0 ? 0
    : amounts.length % 2 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2

  const count = filtered.length
  const avgTransaction = count > 0 ? total / count : 0

  // Standard deviation from Welford's accumulators
  const variance = wN > 1 ? wM2 / (wN - 1) : 0
  const stdDev = Math.sqrt(variance)

  // Percentiles (amounts already sorted)
  const pctl = (p) => {
    if (amounts.length === 0) return 0
    const idx = (p / 100) * (amounts.length - 1)
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    if (lo === hi) return amounts[lo]
    return amounts[lo] + (amounts[hi] - amounts[lo]) * (idx - lo)
  }
  const p10 = pctl(10), p25 = pctl(25), p75 = pctl(75), p90 = pctl(90)

  // Supplier Gini coefficient (concentration measure)
  const supplierAmounts = Object.values(bySupplier)
  let supplierGini = 0
  if (supplierAmounts.length > 1) {
    const sortedSup = [...supplierAmounts].filter(a => a > 0).sort((a, b) => a - b)
    const nSup = sortedSup.length
    const sumSup = sortedSup.reduce((s, v) => s + v, 0)
    if (nSup > 1 && sumSup > 0) {
      let weightedSum = 0
      for (let i = 0; i < nSup; i++) {
        weightedSum += (2 * (i + 1) - nSup - 1) * sortedSup[i]
      }
      supplierGini = weightedSum / (nSup * sumSup)
    }
  }

  // Build chart data structures
  const yearData = Object.entries(byYear).map(([year, amount]) => ({
    year, amount, count: byYearCount[year] || 0,
    avg: (byYearCount[year] || 1) > 0 ? amount / byYearCount[year] : 0,
  })).sort((a, b) => a.year.localeCompare(b.year))

  const categoryData = Object.entries(byCategory)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  const serviceData = Object.entries(byService)
    .map(([name, value]) => ({
      name: name.split(' - ')[1] || name, fullName: name, value,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  const supplierData = Object.entries(bySupplier)
    .map(([name, value]) => ({
      name: name.length > 25 ? name.substring(0, 22) + '...' : name,
      fullName: name, value,
      count: bySupplierCount[name] || 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  const typeData = Object.entries(byTypeChart)
    .map(([name, value]) => ({
      name: typeLabel(name), value, rawType: name,
    }))
    .sort((a, b) => b.value - a.value)

  // Monthly data with 3-month rolling average (last 36 months)
  const monthlyRaw = Object.entries(byMonth)
    .map(([month, amount]) => ({
      month, amount,
      count: byMonthCount[month] || 0,
      label: (() => {
        const [y, m] = month.split('-')
        return new Date(y, m - 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' })
      })(),
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-36)

  const monthlyData = monthlyRaw.map((d, i, arr) => {
    const window = arr.slice(Math.max(0, i - 2), i + 1)
    return { ...d, avg: window.reduce((s, w) => s + w.amount, 0) / window.length }
  })

  return {
    stats: { total, count, suppliers: supplierSet.size, avgTransaction, medianAmount, maxTransaction, byType,
             stdDev, p10, p25, p75, p90, supplierGini },
    chartData: { yearData, categoryData, serviceData, supplierData, typeData, monthlyData },
  }
}

/**
 * Generate CSV string from records.
 */
export function generateCSV(records) {
  const headers = ['Date', 'Supplier', 'Amount', 'Type', 'Service', 'Category', 'Org Unit', 'Transaction']
  const rows = records.map(item => [
    item.date, item.supplier, item.amount, item.type,
    item.service_division, item.expenditure_category, item.organisational_unit, item.transaction_number,
  ])
  return [headers, ...rows].map(row => row.map(cell => `"${cell || ''}"`).join(',')).join('\n')
}
