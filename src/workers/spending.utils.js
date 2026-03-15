/**
 * Pure computation functions for spending data.
 * Used by the spending Web Worker. Fully testable without Worker context.
 */

import { SPENDING_TYPE_LABELS } from '../utils/constants'

export function typeLabel(t) {
  return SPENDING_TYPE_LABELS[t] || t
}

// ─── Spend Classification ──────────────────────────────────────────────────────
// 13 canonical categories aligned with LCC cabinet portfolios + catch-alls.
// Pre-compiled regexes for performance (753K records).

export const SPEND_CATEGORIES = {
  adult_social_care: 'Adult Social Care',
  children_services: "Children's Services",
  education_skills: 'Education & Skills',
  highways_transport: 'Highways & Transport',
  environment_communities: 'Environment & Communities',
  public_health: 'Public Health',
  resources: 'Resources & Corporate',
  ict_digital: 'ICT & Digital',
  economic_development: 'Economic Development',
  leader_cabinet: 'Leader & Cabinet Office',
  schools_delegated: 'Schools (Delegated)',
  capital_projects: 'Capital Projects',
  other: 'Other / Unclassified',
}

/**
 * Tier 1: Department/service_division patterns — from cabinet_portfolios.spending_department_patterns.
 * Order matters: more specific patterns checked before generic ones.
 */
const DEPT_PATTERNS = [
  // Specific prefixes first to avoid false positives
  { cat: 'adult_social_care', re: /^(Adult|Residential(?! Prop)|Home ?Care|Homecare|Day Care|Day Serv|Mental Health.*Adult|Learning Disab|Older P|Direct Payment|Safeguard.*Adult|Supported Living|Nursing(?! Home)|Domicil|Reablement|Extra Care|Shared Lives|OP-|LD-|MH-|MH2-|MH3-|PDSI-|Prevention Short)/i },
  { cat: 'children_services', re: /^(Children|Child |Fostering|Adoption|Looked After|LAC |Safeguard.*Child|Youth Just|Youth Offend|Leaving Care|CAMHS|Family(?! Info))/i },
  { cat: 'public_health', re: /^(Public Health|Health Improv|Drug|Alcohol|Substance|Sexual Health|Health Visit|Health Protect|Smoking|Obesity|Wellbeing(?! Serv)|0-19|0-5)/i },
  { cat: 'education_skills', re: /^(Education|SEND|Special Educ|SEN |Pupil|Librar|Museum|Archive|Skills|Apprentice|Adult Learn|Early Years|Nursery|Home to School|School Transport)/i },
  { cat: 'highways_transport', re: /^(Highway|Road(?!side)|Transport(?! Assist)|Traffic|Parking|Street Light|Bridge|Pothole|Winter Maint|Gritting|Flood|Drainage|Public Trans|Bus |Cycling|Walking|Active Travel)/i },
  { cat: 'environment_communities', re: /^(Waste|Recycl|Environment|Trading Stand|Planning|Countryside|Biodiversity|Climate|Community Safety|Fire |Emergency|Registration|Land Drain|Agricultural|LRL)/i },
  { cat: 'economic_development', re: /^(Economic Dev|Regeneration|Growth|Investment|Tourism|Arts |Culture|Heritage|Sport|Leisure)/i },
  { cat: 'leader_cabinet', re: /^(Chief Exec|Corporate(?! Prop)|Leader|Strategic|External Rel|Communications|Policy)/i },
  { cat: 'ict_digital', re: /^(ICT|Digital|IT |Information Tech|Customer Serv|Contact Centre|Web |Data(?! Protect)|Transformation|Business Change|Procurement)/i },
  { cat: 'resources', re: /^(Finance|HR |Human Res|Property|Estates|Legal|Democratic|Audit|Pension|Retirement|Registr|Coroner|Surplus Asset|Support Serv|Central Admin|Insurance|Treasury)/i },
]

/**
 * Tier 2: Expenditure category / service_area keyword patterns.
 * Broader matching for records that don't match tier 1 department patterns.
 */
const EXPENDITURE_PATTERNS = [
  { cat: 'adult_social_care', re: /residential care|home care|domiciliary|social care.*adult|nursing care|supported living|direct payment|day centre|respite/i },
  { cat: 'children_services', re: /foster|adoption|child.*care|safeguard.*child|youth|looked after|kinship|residential.*child/i },
  { cat: 'education_skills', re: /school|education|pupil|SEN |EHCP|library|museum|early years|nursery/i },
  { cat: 'highways_transport', re: /highway|road|transport|traffic|parking|street light|bridge|pothole|gritting|drainage|bus serv/i },
  { cat: 'environment_communities', re: /waste|recycl|environment|planning|fire|countryside|trading stand|land drain|community safety/i },
  { cat: 'public_health', re: /public health|drug.*alcohol|substance|sexual health|health visit|smoking|obesity/i },
  { cat: 'resources', re: /finance|legal|pension|insurance|audit|treasury|democratic|coroner|HR |human res/i },
  { cat: 'ict_digital', re: /ICT|digital|information tech|customer serv|contact centre|procurement/i },
  { cat: 'economic_development', re: /economic dev|regeneration|tourism|arts|culture|heritage|sport|leisure/i },
]

/** Tier 3: School name heuristics (delegated school budgets) */
const SCHOOL_RE = /\b(Primary|Secondary|Academy|College|Infant|Junior|Grammar|High School|CE |RC |C of E|St\s|Saint\s|Preparatory|Sixth Form|Community School|Free School)/i

/**
 * Classify a spending record into one of 13 canonical categories.
 * Uses 3-tier matching: department patterns → expenditure keywords → heuristics.
 *
 * @param {object} record - Hydrated spending record
 * @returns {{ category: string, category_label: string, confidence: string }}
 */
export function classifySpendCategory(record) {
  const dept = record.department_raw || record.service_division || record.department || ''
  const expCat = record.expenditure_category || record.service_area_raw || record.service_area || ''

  // Tier 1: Department pattern matching (highest confidence)
  for (const { cat, re } of DEPT_PATTERNS) {
    if (re.test(dept)) {
      return { category: cat, category_label: SPEND_CATEGORIES[cat], confidence: 'high' }
    }
  }

  // Special case: "School" prefix in department → education_skills (not schools_delegated, which is for specific school names)
  if (/^School\b/i.test(dept)) {
    return { category: 'education_skills', category_label: SPEND_CATEGORIES.education_skills, confidence: 'high' }
  }

  // Tier 2: Expenditure category keyword matching (medium confidence)
  for (const { cat, re } of EXPENDITURE_PATTERNS) {
    if (re.test(expCat)) {
      return { category: cat, category_label: SPEND_CATEGORIES[cat], confidence: 'medium' }
    }
  }

  // Tier 3: Heuristics (lower confidence)
  // School names in department → schools_delegated
  if (dept && SCHOOL_RE.test(dept)) {
    return { category: 'schools_delegated', category_label: SPEND_CATEGORIES.schools_delegated, confidence: 'medium' }
  }

  // Capital revenue indicator
  if (record.capital_revenue === 'capital' || record.capital_revenue === 'Capital') {
    return { category: 'capital_projects', category_label: SPEND_CATEGORIES.capital_projects, confidence: 'low' }
  }

  // Unclassified
  return { category: 'other', category_label: SPEND_CATEGORIES.other, confidence: 'low' }
}

/**
 * Compute a lightweight spending summary from all loaded records.
 * Returns a ~50KB object suitable for cross-page consumption.
 *
 * @param {object[]} records - All hydrated spending records
 * @returns {object} Spending summary with portfolio breakdown, monthly trends, top suppliers
 */
export function computeSpendingSummary(records) {
  if (!records?.length) return null

  const portfolioAgg = {}  // by spend_category
  const monthAgg = {}
  const supplierAgg = {}
  const deptAgg = {}
  let totalSpend = 0
  let totalIncome = 0
  let classified = 0
  let unclassified = 0

  for (const r of records) {
    const amt = Number(r.amount) || 0
    if (amt >= 0) totalSpend += amt
    else totalIncome += amt

    // By portfolio/category
    const cat = r.spend_category || 'other'
    if (cat !== 'other') classified++
    else unclassified++

    if (!portfolioAgg[cat]) {
      portfolioAgg[cat] = { total: 0, count: 0, income: 0, suppliers: new Set(), months: {} }
    }
    const pa = portfolioAgg[cat]
    if (amt >= 0) pa.total += amt
    else pa.income += amt
    pa.count++
    if (r.supplier) pa.suppliers.add(r.supplier)

    // Monthly within portfolio
    if (r.date) {
      const mk = r.date.substring(0, 7) // "YYYY-MM"
      pa.months[mk] = (pa.months[mk] || 0) + amt
    }

    // Overall monthly
    if (r.date) {
      const mk = r.date.substring(0, 7)
      if (!monthAgg[mk]) monthAgg[mk] = { total: 0, count: 0 }
      monthAgg[mk].total += amt
      monthAgg[mk].count++
    }

    // Supplier totals
    if (r.supplier) {
      if (!supplierAgg[r.supplier]) supplierAgg[r.supplier] = { total: 0, count: 0, categories: new Set() }
      supplierAgg[r.supplier].total += amt
      supplierAgg[r.supplier].count++
      if (cat !== 'other') supplierAgg[r.supplier].categories.add(cat)
    }

    // Department totals
    const dept = r.service_division || r.department || 'Unknown'
    if (!deptAgg[dept]) deptAgg[dept] = { total: 0, count: 0, category: cat }
    deptAgg[dept].total += amt
    deptAgg[dept].count++
  }

  // Build portfolio objects with top suppliers
  const by_portfolio = {}
  for (const [cat, agg] of Object.entries(portfolioAgg)) {
    // Compute per-portfolio supplier ranking
    const portfolioSuppliers = {}
    for (const r of records) {
      if ((r.spend_category || 'other') !== cat || !r.supplier) continue
      const amt = Number(r.amount) || 0
      if (!portfolioSuppliers[r.supplier]) portfolioSuppliers[r.supplier] = { total: 0, count: 0 }
      portfolioSuppliers[r.supplier].total += amt
      portfolioSuppliers[r.supplier].count++
    }
    const topSuppliers = Object.entries(portfolioSuppliers)
      .map(([name, s]) => ({ name, total: s.total, count: s.count, pct: agg.total > 0 ? (s.total / agg.total * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    // Compute HHI for this portfolio
    const supplierShares = Object.values(portfolioSuppliers).map(s => agg.total > 0 ? (s.total / agg.total * 100) : 0)
    const hhi = supplierShares.reduce((sum, s) => sum + s * s, 0)

    by_portfolio[cat] = {
      label: SPEND_CATEGORIES[cat] || cat,
      total: agg.total,
      income: agg.income,
      net: agg.total + agg.income,
      count: agg.count,
      unique_suppliers: agg.suppliers.size,
      top_suppliers: topSuppliers,
      hhi: Math.round(hhi),
      by_month: Object.entries(agg.months).map(([month, total]) => ({ month, total })).sort((a, b) => a.month.localeCompare(b.month)),
    }
  }

  // Top suppliers overall
  const top_suppliers = Object.entries(supplierAgg)
    .map(([name, s]) => ({ name, total: s.total, count: s.count, categories: [...s.categories] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 30)

  // Top departments
  const top_departments = Object.entries(deptAgg)
    .map(([name, d]) => ({ name, total: d.total, count: d.count, category: d.category }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 50)

  // Monthly trend
  const by_month = Object.entries(monthAgg)
    .map(([month, d]) => ({ month, total: d.total, count: d.count }))
    .sort((a, b) => a.month.localeCompare(b.month))

  return {
    total_spend: totalSpend,
    total_income: totalIncome,
    net: totalSpend + totalIncome,
    record_count: records.length,
    coverage: {
      classified,
      unclassified,
      pct: records.length > 0 ? Math.round(classified / records.length * 100) : 0,
    },
    by_portfolio,
    by_month,
    top_suppliers,
    top_departments,
  }
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
  // Classify spend category (runs once per hydration, cached on record)
  if (!h.spend_category) {
    const cls = classifySpendCategory(h)
    h.spend_category = cls.category
    h.spend_category_label = cls.category_label
  }
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
    spend_categories: new Set(),
    capital_revenue: new Set(),
    suppliers: new Set(),
    months: new Set(),
  }

  for (const r of records) {
    if (r.financial_year) sets.financial_years.add(r.financial_year)
    if (r.type) sets.types.add(r.type)
    if (r.service_division) sets.service_divisions.add(r.service_division)
    if (r.expenditure_category) sets.expenditure_categories.add(r.expenditure_category)
    if (r.spend_category_label) sets.spend_categories.add(r.spend_category_label)
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
    spend_categories: [...sets.spend_categories].sort(),
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
      item.spend_category_label?.toLowerCase().includes(searchLower) ||
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
  if (filters.spend_category) result = result.filter(item => item.spend_category_label === filters.spend_category)
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
  const bySpendCategory = {}
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

    // Chart: by spend category
    const sc = item.spend_category_label || 'Other / Unclassified'
    bySpendCategory[sc] = (bySpendCategory[sc] || 0) + amt

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

  const spendCategoryData = Object.entries(bySpendCategory)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

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
    chartData: { yearData, categoryData, serviceData, spendCategoryData, supplierData, typeData, monthlyData },
  }
}

/**
 * Generate CSV string from records.
 */
export function generateCSV(records) {
  const headers = ['Date', 'Supplier', 'Amount', 'Type', 'Service', 'Category', 'Spend Category', 'Org Unit', 'Transaction']
  const rows = records.map(item => [
    item.date, item.supplier, item.amount, item.type,
    item.service_division, item.expenditure_category, item.spend_category_label, item.organisational_unit, item.transaction_number,
  ])
  return [headers, ...rows].map(row => row.map(cell => `"${cell || ''}"`).join(',')).join('\n')
}
