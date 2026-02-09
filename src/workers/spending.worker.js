/**
 * Web Worker for spending data processing.
 *
 * Holds the entire spending dataset in worker memory.
 * Main thread sends commands (INIT, QUERY, EXPORT).
 * Worker returns only paginated slices + aggregated stats.
 *
 * This keeps 20-40MB of JSON data OFF the main thread,
 * eliminating all UI blocking from parse/filter/sort/aggregate.
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

/**
 * Resolve URL relative to worker's base.
 * Workers don't have import.meta.env.BASE_URL, so the main thread
 * passes the fully resolved URL in the INIT message.
 */
async function fetchAndParse(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  return response.json()
}

/**
 * Handle INIT: fetch + parse spending.json, build filter options.
 */
async function handleInit(url) {
  self.postMessage({ type: 'LOADING' })

  try {
    const data = await fetchAndParse(url)

    // Support both v2 format (object with meta/filterOptions/records)
    // and v1 format (plain array)
    if (data && data.meta?.version === 2) {
      allRecords = data.records || []
      // Use pre-computed filter options from ETL, but still compute months
      // (months are date-derived and not stored in v2 format)
      filterOptions = data.filterOptions || {}
      if (!filterOptions.months) {
        const months = new Set()
        for (const r of allRecords) {
          if (r.date) {
            const d = new Date(r.date)
            if (!isNaN(d.getTime())) {
              months.add(d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }))
            }
          }
        }
        filterOptions.months = [...months].sort()
      }
      if (!filterOptions.quarters) {
        filterOptions.quarters = ['Q1', 'Q2', 'Q3', 'Q4']
      }
    } else {
      // v1 format: plain array — scan for filter options
      allRecords = Array.isArray(data) ? data : []
      filterOptions = buildFilterOptions(allRecords)
    }

    self.postMessage({
      type: 'READY',
      filterOptions,
      totalRecords: allRecords.length,
    })
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err.message })
  }
}

/**
 * Handle QUERY: filter, sort, paginate, compute stats + charts.
 * Returns only the current page slice + aggregated data.
 */
function handleQuery({ queryId, filters, search, sortField, sortDir, page, pageSize }) {
  try {
    // Filter
    const filtered = filterRecords(allRecords, filters || {}, search || '')

    // Sort
    const sorted = sortRecords(filtered, sortField || 'date', sortDir || 'desc')

    // Paginate
    const p = page || 1
    const ps = pageSize || 200
    const start = (p - 1) * ps
    const paginatedData = sorted.slice(start, start + ps)
    const totalPages = Math.ceil(sorted.length / ps)

    // Compute stats + chart data in a single pass over filtered (not sorted) data
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
    default:
      console.warn('Unknown worker message type:', type)
  }
}
