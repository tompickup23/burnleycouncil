import { useState, useEffect, useRef, useCallback } from 'react'

// Resolve URLs relative to the Vite base path
const BASE = import.meta.env.BASE_URL

function resolveUrl(url) {
  if (!url.startsWith('/')) return url
  return BASE + url.slice(1)
}

/**
 * React hook that manages a spending data Web Worker.
 *
 * Supports v4 monthly chunked mode (large councils), v3 year-chunked mode,
 * and v2/v1 monolith mode. In v4, only the latest month is loaded initially.
 * In v3, only the latest year is loaded initially.
 *
 * @returns {{
 *   loading: boolean,
 *   ready: boolean,
 *   error: Error|null,
 *   filterOptions: object|null,
 *   results: object|null,
 *   totalRecords: number,
 *   query: (params: object) => void,
 *   exportCSV: (params: object) => void,
 *   yearManifest: object|null,
 *   loadedYears: string[],
 *   yearLoading: string|null,
 *   allYearsLoaded: boolean,
 *   latestYear: string|null,
 *   chunked: boolean,
 *   loadYear: (year: string) => void,
 *   loadAllYears: () => void,
 *   monthly: boolean,
 *   loadedMonths: string[],
 *   monthLoading: string|null,
 *   latestMonth: string|null,
 *   loadMonth: (year: string, month: string) => void,
 * }}
 */
export function useSpendingWorker() {
  const workerRef = useRef(null)
  const queryIdRef = useRef(0)
  const debounceRef = useRef(null)
  const exportCallbackRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [filterOptions, setFilterOptions] = useState(null)
  const [results, setResults] = useState(null)
  const [totalRecords, setTotalRecords] = useState(0)

  // v3/v4 chunked state
  const [yearManifest, setYearManifest] = useState(null)
  const [loadedYears, setLoadedYears] = useState([])
  const [yearLoading, setYearLoading] = useState(null)
  const [allYearsLoaded, setAllYearsLoaded] = useState(false)
  const [latestYear, setLatestYear] = useState(null)
  const [chunked, setChunked] = useState(false)

  // v4 monthly state
  const [monthly, setMonthly] = useState(false)
  const [loadedMonths, setLoadedMonths] = useState([])
  const [monthLoading, setMonthLoading] = useState(null)
  const [latestMonth, setLatestMonth] = useState(null)

  // Create worker on mount, terminate on unmount
  useEffect(() => {
    let worker
    try {
      worker = new Worker(
        new URL('../workers/spending.worker.js', import.meta.url),
        { type: 'module' }
      )
    } catch (err) {
      setError(new Error('Web Workers not supported in this browser'))
      setLoading(false)
      return
    }

    workerRef.current = worker

    worker.onmessage = (e) => {
      const msg = e.data

      switch (msg.type) {
        case 'LOADING':
          setLoading(true)
          break

        case 'READY':
          setFilterOptions(msg.filterOptions)
          setTotalRecords(msg.totalRecords)
          setReady(true)
          if (msg.chunked) {
            setChunked(true)
            setYearManifest(msg.yearManifest || null)
            setLatestYear(msg.latestYear || null)
            setLoadedYears(msg.loadedYears || [])
          }
          if (msg.monthly) {
            setMonthly(true)
            setLatestMonth(msg.latestMonth || null)
          }
          // Don't clear loading yet — wait for first RESULTS
          break

        case 'YEAR_LOADING':
          setYearLoading(msg.year)
          break

        case 'YEAR_LOADED':
          setLoadedYears([...(msg.loadedYears || [])])
          setTotalRecords(msg.totalInMemory)
          setYearLoading(null)
          break

        case 'ALL_YEARS_LOADED':
          setLoadedYears([...(msg.loadedYears || [])])
          setTotalRecords(msg.totalInMemory)
          setAllYearsLoaded(true)
          setYearLoading(null)
          break

        case 'MONTH_LOADING':
          setMonthLoading(msg.month)
          break

        case 'MONTH_LOADED':
          setLoadedMonths([...(msg.loadedMonths || [])])
          setLoadedYears([...(msg.loadedYears || [])])
          setTotalRecords(msg.totalInMemory)
          setMonthLoading(null)
          break

        case 'RESULTS': {
          // Discard stale responses from outdated queries
          if (msg.queryId < queryIdRef.current) break
          setResults({
            paginatedData: msg.paginatedData,
            filteredCount: msg.filteredCount,
            totalPages: msg.totalPages,
            stats: msg.stats,
            chartData: msg.chartData,
          })
          setLoading(false)
          setError(null)
          break
        }

        case 'EXPORT_RESULT': {
          const blob = new Blob([msg.csv], { type: 'text/csv' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = exportCallbackRef.current?.filename || 'spending-export.csv'
          a.click()
          URL.revokeObjectURL(url)
          break
        }

        case 'ERROR':
          setError(new Error(msg.message))
          setLoading(false)
          setYearLoading(null)
          break
      }
    }

    worker.onerror = (err) => {
      setError(new Error(err.message || 'Worker error'))
      setLoading(false)
    }

    // Initialize: worker tries spending-index.json first, falls back to spending.json
    worker.postMessage({
      type: 'INIT',
      url: resolveUrl('/data/spending.json'),
    })

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  /**
   * Send a query to the worker. Debounced by 100ms.
   */
  const query = useCallback((params) => {
    if (!workerRef.current) return

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      const id = ++queryIdRef.current
      workerRef.current.postMessage({
        type: 'QUERY',
        queryId: id,
        ...params,
      })
    }, 100)
  }, [])

  /**
   * Request CSV export from the worker.
   */
  const exportCSV = useCallback((params) => {
    if (!workerRef.current) return
    exportCallbackRef.current = { filename: params?.filename || 'spending-export.csv' }
    workerRef.current.postMessage({
      type: 'EXPORT',
      filters: params?.filters,
      search: params?.search,
      sortField: params?.sortField,
      sortDir: params?.sortDir,
    })
  }, [])

  /**
   * Load a specific year's data chunk (v3 only).
   */
  const loadYear = useCallback((year) => {
    if (!workerRef.current) return
    workerRef.current.postMessage({ type: 'LOAD_YEAR', year })
  }, [])

  /**
   * Load all remaining year chunks progressively (v3/v4).
   */
  const loadAllYears = useCallback(() => {
    if (!workerRef.current) return
    workerRef.current.postMessage({ type: 'LOAD_ALL_YEARS' })
  }, [])

  /**
   * Load a specific month's data chunk (v4 monthly only).
   */
  const loadMonth = useCallback((year, month) => {
    if (!workerRef.current) return
    workerRef.current.postMessage({ type: 'LOAD_MONTH', year, month })
  }, [])

  return {
    loading,
    ready,
    error,
    filterOptions,
    results,
    totalRecords,
    query,
    exportCSV,
    // v3/v4 chunked
    yearManifest,
    loadedYears,
    yearLoading,
    allYearsLoaded,
    latestYear,
    chunked,
    loadYear,
    loadAllYears,
    // v4 monthly
    monthly,
    loadedMonths,
    monthLoading,
    latestMonth,
    loadMonth,
  }
}
