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
 * The Worker holds the entire spending dataset (20-40MB) in its own thread.
 * This hook sends INIT/QUERY/EXPORT commands and receives results.
 * Only the current page slice (~50-500 records) crosses the postMessage boundary.
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

  // Create worker on mount, terminate on unmount
  useEffect(() => {
    let worker
    try {
      worker = new Worker(
        new URL('../workers/spending.worker.js', import.meta.url),
        { type: 'module' }
      )
    } catch (err) {
      // Workers not supported (very rare in 2026, but handle gracefully)
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
          // Don't clear loading yet — wait for first RESULTS
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
          // Trigger download from the CSV string
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
          break
      }
    }

    worker.onerror = (err) => {
      setError(new Error(err.message || 'Worker error'))
      setLoading(false)
    }

    // Initialize: tell worker to fetch and parse spending.json
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
   * Send a query to the worker. Debounced by 100ms to avoid
   * over-querying during rapid filter changes (typing in search box).
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
   * Worker generates CSV string, main thread creates blob + download.
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

  return {
    loading,
    ready,
    error,
    filterOptions,
    results,
    totalRecords,
    query,
    exportCSV,
  }
}
