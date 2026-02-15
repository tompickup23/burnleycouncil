/**
 * Web Worker for spending data processing.
 *
 * Supports four loading modes:
 *   v4 (monthly):  Fetches spending-index.json, loads month chunks on demand (large councils)
 *   v3 (chunked):  Fetches spending-index.json, loads year chunks on demand
 *   v2 (monolith): Fetches spending.json with pre-computed filterOptions
 *   v1 (legacy):   Fetches spending.json as plain array
 *
 * Main thread sends: INIT, QUERY, EXPORT, LOAD_YEAR, LOAD_ALL_YEARS, LOAD_MONTH
 * Worker returns:    READY, RESULTS, EXPORT_RESULT, YEAR_LOADED, ALL_YEARS_LOADED,
 *                    MONTH_LOADING, MONTH_LOADED, ERROR
 */

import {
  buildFilterOptions,
  filterRecords,
  sortRecords,
  computeAll,
  generateCSV,
  hydrateRecord,
} from './spending.utils.js'

// --- Worker State ---
let allRecords = []
let filterOptions = null
let yearManifest = null      // v3/v4: year-level manifest
let loadedYears = new Set()  // v3/v4: which financial years are fully loaded
let loadingYears = new Set() // v3/v4: which years are currently being loaded (prevents re-entrant loading)
let loadedMonths = new Set() // v4: which months have been fetched ("YYYY-MM")
let loadingMonths = new Set() // v4: which months are currently being fetched (prevents re-entrant loading)
let latestYear = null        // v3/v4: most recent financial year
let latestMonth = null       // v4: most recent month key
let baseUrl = ''             // v3/v4: base URL for resolving chunk paths
let isChunked = false        // v3/v4 active?
let isMonthly = false        // v4 monthly mode?
let isStripped = false       // v4 stripped records?
let councilId = ''           // For hydration of stripped records

async function fetchAndParse(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  return response.json()
}

/** Try fetching a URL, return null on 404 */
async function tryFetch(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}

/** Compute months from loaded records (not pre-computed in ETL) */
function computeMonths(records) {
  const months = new Set()
  for (const r of records) {
    if (r.date) {
      const d = new Date(r.date)
      if (!isNaN(d.getTime())) {
        months.add(d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }))
      }
    }
  }
  return [...months].sort()
}

/**
 * Handle INIT: try v4 monthly first, then v3 chunked, fall back to v2/v1 monolith.
 * url = fully resolved path to spending.json (from main thread)
 */
async function handleInit(url) {
  self.postMessage({ type: 'LOADING' })

  try {
    // Derive index URL: /data/spending.json → /data/spending-index.json
    const indexUrl = url.replace(/spending\.json$/, 'spending-index.json')
    baseUrl = url.replace(/spending\.json$/, '')

    // Try chunked format (v3 or v4) from spending-index.json
    const indexData = await tryFetch(indexUrl)

    if (indexData && indexData.meta?.version >= 4 && indexData.meta?.monthly) {
      // ── v4: Monthly chunked mode (large councils) ──
      isChunked = true
      isMonthly = true
      isStripped = !!indexData.meta?.stripped
      councilId = indexData.meta?.council_id || ''
      yearManifest = indexData.years || {}
      latestYear = indexData.latest_year || null
      latestMonth = indexData.latest_month || null
      filterOptions = indexData.filterOptions || {}
      if (!filterOptions.quarters) filterOptions.quarters = ['Q1', 'Q2', 'Q3', 'Q4']
      if (!filterOptions.months) filterOptions.months = []

      self.postMessage({
        type: 'READY',
        filterOptions,
        totalRecords: indexData.meta.record_count,
        yearManifest,
        latestYear,
        loadedYears: [],
        chunked: true,
        monthly: true,
        latestMonth,
      })

      // Auto-load the latest month of the latest year
      if (latestYear && latestMonth && yearManifest[latestYear]?.months?.[latestMonth]) {
        await loadMonthChunk(latestYear, latestMonth)
      }
      return
    }

    if (indexData && indexData.meta?.version >= 3 && indexData.meta?.chunked) {
      // ── v3: Year chunked mode ──
      isChunked = true
      yearManifest = indexData.years || {}
      latestYear = indexData.latest_year || null
      filterOptions = indexData.filterOptions || {}
      if (!filterOptions.quarters) filterOptions.quarters = ['Q1', 'Q2', 'Q3', 'Q4']
      if (!filterOptions.months) filterOptions.months = []

      self.postMessage({
        type: 'READY',
        filterOptions,
        totalRecords: indexData.meta.record_count,
        yearManifest,
        latestYear,
        loadedYears: [],
        chunked: true,
      })

      // Auto-load the latest year
      if (latestYear && yearManifest[latestYear]) {
        await loadYearChunk(latestYear)
      }
      return
    }

    // ── v2/v1: Monolith fallback ──
    const data = await fetchAndParse(url)

    if (data && (data.meta?.version === 2 || data.meta?.format_version === 2)) {
      allRecords = data.records || []
      filterOptions = data.filterOptions || {}
      // Normalize quarters: older data has integers [1,2,3,4], we need strings ['Q1','Q2','Q3','Q4']
      if (!filterOptions.quarters || (filterOptions.quarters.length && typeof filterOptions.quarters[0] === 'number')) {
        filterOptions.quarters = ['Q1', 'Q2', 'Q3', 'Q4']
      }
      // Normalize months: older data has integers [1..12], we need "Month Year" strings
      if (!filterOptions.months || (filterOptions.months.length && typeof filterOptions.months[0] === 'number')) {
        filterOptions.months = computeMonths(allRecords)
      }
    } else {
      allRecords = Array.isArray(data) ? data : []
      filterOptions = buildFilterOptions(allRecords)
    }

    self.postMessage({
      type: 'READY',
      filterOptions,
      totalRecords: allRecords.length,
      chunked: false,
    })
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err.message })
  }
}

/**
 * Load a single month chunk and merge into allRecords. (v4 only)
 */
async function loadMonthChunk(yearKey, monthKey) {
  if (loadedMonths.has(monthKey) || loadingMonths.has(monthKey)) {
    if (loadedMonths.has(monthKey)) {
      self.postMessage({
        type: 'MONTH_LOADED',
        month: monthKey,
        year: yearKey,
        loadedMonths: [...loadedMonths],
        loadedYears: [...loadedYears],
        totalInMemory: allRecords.length,
      })
    }
    return
  }

  const yearInfo = yearManifest[yearKey]
  if (!yearInfo?.months?.[monthKey]) return

  loadingMonths.add(monthKey)
  const monthInfo = yearInfo.months[monthKey]
  self.postMessage({ type: 'MONTH_LOADING', month: monthKey, year: yearKey })

  try {
    let records = await fetchAndParse(baseUrl + monthInfo.file)
    if (Array.isArray(records)) {
      if (isStripped) {
        records = records.map(r => hydrateRecord(r, councilId))
      }
      allRecords = allRecords.concat(records)
      loadedMonths.add(monthKey)
      loadingMonths.delete(monthKey)

      // Check if all months for this year are now loaded
      const yearMonths = Object.keys(yearInfo.months)
      if (yearMonths.every(m => loadedMonths.has(m))) {
        loadedYears.add(yearKey)
      }

      // Update months in filterOptions
      const newMonths = computeMonths(records)
      const existingMonths = new Set(filterOptions.months || [])
      for (const m of newMonths) existingMonths.add(m)
      filterOptions.months = [...existingMonths].sort()
    }

    self.postMessage({
      type: 'MONTH_LOADED',
      month: monthKey,
      year: yearKey,
      loadedMonths: [...loadedMonths],
      loadedYears: [...loadedYears],
      totalInMemory: allRecords.length,
    })
  } catch (err) {
    loadingMonths.delete(monthKey)
    self.postMessage({ type: 'ERROR', message: `Failed to load ${monthKey}: ${err.message}` })
  }
}

/**
 * Load a single year chunk and merge into allRecords.
 * In v4 monthly mode, loads all months within the year.
 */
async function loadYearChunk(year) {
  if (loadedYears.has(year) || loadingYears.has(year)) {
    if (loadedYears.has(year)) {
      self.postMessage({
        type: 'YEAR_LOADED',
        year,
        loadedYears: [...loadedYears],
        totalInMemory: allRecords.length,
      })
    }
    return
  }

  loadingYears.add(year)

  // v4 monthly: load all months in the year
  if (isMonthly) {
    const yearInfo = yearManifest[year]
    if (!yearInfo?.months) { loadingYears.delete(year); return }
    self.postMessage({ type: 'YEAR_LOADING', year })
    const monthKeys = Object.keys(yearInfo.months).sort()
    for (const mk of monthKeys) {
      await loadMonthChunk(year, mk)
    }
    loadedYears.add(year)
    loadingYears.delete(year)
    self.postMessage({
      type: 'YEAR_LOADED',
      year,
      loadedYears: [...loadedYears],
      totalInMemory: allRecords.length,
    })
    return
  }

  // v3: load year file directly
  const info = yearManifest[year]
  if (!info) { loadingYears.delete(year); return }

  self.postMessage({ type: 'YEAR_LOADING', year })

  try {
    const records = await fetchAndParse(baseUrl + info.file)
    if (Array.isArray(records)) {
      allRecords = allRecords.concat(records)
      loadedYears.add(year)

      // Update months for newly loaded records
      const newMonths = computeMonths(records)
      const existingMonths = new Set(filterOptions.months || [])
      for (const m of newMonths) existingMonths.add(m)
      filterOptions.months = [...existingMonths].sort()
    }

    loadingYears.delete(year)
    self.postMessage({
      type: 'YEAR_LOADED',
      year,
      loadedYears: [...loadedYears],
      totalInMemory: allRecords.length,
    })
  } catch (err) {
    loadingYears.delete(year)
    self.postMessage({ type: 'ERROR', message: `Failed to load ${year}: ${err.message}` })
  }
}

/**
 * Handle LOAD_YEAR: load a specific year on demand.
 */
async function handleLoadYear({ year }) {
  await loadYearChunk(year)
}

/**
 * Handle LOAD_MONTH: load a specific month on demand. (v4 only)
 */
async function handleLoadMonth({ year, month }) {
  if (isMonthly) {
    await loadMonthChunk(year, month)
  }
}

/**
 * Handle LOAD_ALL_YEARS: progressively load all remaining years.
 */
async function handleLoadAllYears() {
  const allYears = Object.keys(yearManifest).sort()
  for (const year of allYears) {
    if (!loadedYears.has(year)) {
      await loadYearChunk(year)
    }
  }
  self.postMessage({
    type: 'ALL_YEARS_LOADED',
    loadedYears: [...loadedYears],
    totalInMemory: allRecords.length,
  })
}

/**
 * Handle QUERY: filter, sort, paginate, compute stats + charts.
 */
function handleQuery({ queryId, filters, search, sortField, sortDir, page, pageSize }) {
  try {
    const filtered = filterRecords(allRecords, filters || {}, search || '')
    const sorted = sortRecords(filtered, sortField || 'date', sortDir || 'desc')

    const p = page || 1
    const ps = pageSize || 200
    const start = (p - 1) * ps
    const paginatedData = sorted.slice(start, start + ps)
    const totalPages = Math.ceil(sorted.length / ps)

    const { stats, chartData } = computeAll(filtered)

    self.postMessage({
      type: 'RESULTS',
      queryId,
      paginatedData,
      filteredCount: filtered.length,
      totalPages,
      stats,
      chartData,
    })
  } catch (err) {
    self.postMessage({ type: 'ERROR', queryId, message: err.message })
  }
}

/**
 * Handle EXPORT: generate CSV from filtered + sorted data.
 */
function handleExport({ filters, search, sortField, sortDir }) {
  try {
    const filtered = filterRecords(allRecords, filters || {}, search || '')
    const sorted = sortRecords(filtered, sortField || 'date', sortDir || 'desc')
    const csv = generateCSV(sorted)
    self.postMessage({ type: 'EXPORT_RESULT', csv })
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err.message })
  }
}

// --- Message Handler ---
self.onmessage = function (e) {
  const { type, ...payload } = e.data

  switch (type) {
    case 'INIT':
      handleInit(payload.url)
      break
    case 'QUERY':
      handleQuery(payload)
      break
    case 'EXPORT':
      handleExport(payload)
      break
    case 'LOAD_YEAR':
      handleLoadYear(payload)
      break
    case 'LOAD_ALL_YEARS':
      handleLoadAllYears()
      break
    case 'LOAD_MONTH':
      handleLoadMonth(payload)
      break
    default:
      console.warn('Unknown worker message type:', type)
  }
}
