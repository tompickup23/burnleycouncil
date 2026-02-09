/**
 * Web Worker for spending data processing.
 *
 * Supports three loading modes:
 *   v3 (chunked): Fetches spending-index.json first, then loads year chunks on demand
 *   v2 (monolith): Fetches spending.json with pre-computed filterOptions
 *   v1 (legacy):   Fetches spending.json as plain array
 *
 * Main thread sends: INIT, QUERY, EXPORT, LOAD_YEAR, LOAD_ALL_YEARS
 * Worker returns:    READY, RESULTS, EXPORT_RESULT, YEAR_LOADED, ALL_YEARS_LOADED, ERROR
 */

import {
  buildFilterOptions,
  filterRecords,
  sortRecords,
  computeAll,
  generateCSV,
} from './spending.utils.js'

// --- Worker State ---
let allRecords = []
let filterOptions = null
let yearManifest = null      // v3: { "2024/25": { file, record_count, total_spend }, ... }
let loadedYears = new Set()  // v3: which years have been fetched
let latestYear = null        // v3: most recent year
let baseUrl = ''             // v3: base URL for resolving year chunk paths
let isChunked = false        // v3 active?

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
 * Handle INIT: try v3 chunked first, fall back to v2/v1 monolith.
 * url = fully resolved path to spending.json (from main thread)
 */
async function handleInit(url) {
  self.postMessage({ type: 'LOADING' })

  try {
    // Derive index URL: /data/spending.json → /data/spending-index.json
    const indexUrl = url.replace(/spending\.json$/, 'spending-index.json')
    baseUrl = url.replace(/spending\.json$/, '')

    // Try v3 chunked format first
    const indexData = await tryFetch(indexUrl)

    if (indexData && indexData.meta?.version >= 3 && indexData.meta?.chunked) {
      // ── v3: Chunked mode ──
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

    if (data && data.meta?.version === 2) {
      allRecords = data.records || []
      filterOptions = data.filterOptions || {}
      if (!filterOptions.months) filterOptions.months = computeMonths(allRecords)
      if (!filterOptions.quarters) filterOptions.quarters = ['Q1', 'Q2', 'Q3', 'Q4']
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
 * Load a single year chunk and merge into allRecords.
 */
async function loadYearChunk(year) {
  if (loadedYears.has(year)) {
    self.postMessage({
      type: 'YEAR_LOADED',
      year,
      loadedYears: [...loadedYears],
      totalInMemory: allRecords.length,
    })
    return
  }

  const info = yearManifest[year]
  if (!info) return

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

    self.postMessage({
      type: 'YEAR_LOADED',
      year,
      loadedYears: [...loadedYears],
      totalInMemory: allRecords.length,
    })
  } catch (err) {
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
    default:
      console.warn('Unknown worker message type:', type)
  }
}
