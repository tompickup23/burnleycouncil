import { useState, useEffect } from 'react'
import { useCouncilConfig } from '../context/CouncilConfig'

// ─── Module-Level Singleton Cache ───────────────────────────────────────────────
// Spending summary is expensive to compute (loads all chunks, classifies 753K records).
// We compute it ONCE per session and cache the result. All subsequent hook callers
// get the cached summary instantly. The worker is terminated after computation.

let cachedSummary = null
let pendingCallbacks = null  // array of {resolve, reject} while loading
let workerInstance = null

const BASE = import.meta.env.BASE_URL
function resolveUrl(url) {
  if (!url.startsWith('/')) return url
  return BASE + url.slice(1)
}

/**
 * Initiate spending summary computation via a dedicated worker.
 * Loads all spending data, classifies, aggregates, returns lightweight summary.
 * Worker is terminated after completion.
 *
 * @returns {Promise<object>} Spending summary object
 */
function loadSummary() {
  return new Promise((resolve, reject) => {
    if (cachedSummary) { resolve(cachedSummary); return }

    // If already loading, attach to existing promise
    if (pendingCallbacks) {
      pendingCallbacks.push({ resolve, reject })
      return
    }

    pendingCallbacks = [{ resolve, reject }]

    try {
      const worker = new Worker(
        new URL('../workers/spending.worker.js', import.meta.url),
        { type: 'module' }
      )
      workerInstance = worker

      let allYearsLoaded = false
      let isMonthly = false
      let isChunked = false

      worker.onmessage = (e) => {
        const msg = e.data

        switch (msg.type) {
          case 'READY':
            isMonthly = !!msg.monthly
            isChunked = !!msg.chunked

            // For non-chunked data, records are already loaded — compute summary
            if (!isChunked && !isMonthly) {
              worker.postMessage({ type: 'COMPUTE_SUMMARY' })
              return
            }

            // For chunked/monthly: load all data first
            worker.postMessage({ type: 'LOAD_ALL_YEARS' })
            break

          case 'ALL_YEARS_LOADED':
            allYearsLoaded = true
            // All data loaded — now compute summary
            worker.postMessage({ type: 'COMPUTE_SUMMARY' })
            break

          case 'SUMMARY_RESULT': {
            cachedSummary = msg.summary
            worker.terminate()
            workerInstance = null
            const callbacks = pendingCallbacks
            pendingCallbacks = null
            for (const cb of callbacks) cb.resolve(msg.summary)
            break
          }

          case 'ERROR': {
            const err = new Error(msg.message)
            // Don't fail on year/month loading errors — keep going
            if (msg.message?.includes('Failed to load')) {
              console.warn('Spending summary: chunk load warning:', msg.message)
              return
            }
            worker.terminate()
            workerInstance = null
            const callbacks2 = pendingCallbacks
            pendingCallbacks = null
            if (callbacks2) for (const cb of callbacks2) cb.reject(err)
            break
          }

          // Ignore progress messages
          case 'LOADING':
          case 'YEAR_LOADING':
          case 'YEAR_LOADED':
          case 'MONTH_LOADING':
          case 'MONTH_LOADED':
          case 'RESULTS':
            break
        }
      }

      worker.onerror = (err) => {
        worker.terminate()
        workerInstance = null
        const error = new Error(err.message || 'Worker error')
        const callbacks = pendingCallbacks
        pendingCallbacks = null
        if (callbacks) for (const cb of callbacks) cb.reject(error)
      }

      // Initialize worker — it will try spending-index.json first, fallback to spending.json
      worker.postMessage({
        type: 'INIT',
        url: resolveUrl('/data/spending.json'),
      })
    } catch (err) {
      const callbacks = pendingCallbacks
      pendingCallbacks = null
      if (callbacks) for (const cb of callbacks) cb.reject(err)
    }
  })
}

/**
 * React hook providing a spending summary for the current council.
 * Uses a singleton worker pattern: the first caller triggers computation,
 * subsequent callers get the cached result instantly.
 *
 * Only activates when the council has spending data enabled.
 * Returns null summary for councils without spending data.
 *
 * @returns {{ summary: object|null, loading: boolean, error: Error|null }}
 */
export function useSpendingSummary() {
  const config = useCouncilConfig()
  const hasSpending = config?.data_sources?.spending !== false && config?.spending !== false

  const [summary, setSummary] = useState(cachedSummary)
  const [loading, setLoading] = useState(!cachedSummary && hasSpending)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!hasSpending) {
      setLoading(false)
      return
    }
    if (cachedSummary) {
      setSummary(cachedSummary)
      setLoading(false)
      return
    }

    let cancelled = false

    loadSummary()
      .then(s => {
        if (!cancelled) {
          setSummary(s)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [hasSpending])

  return { summary, loading, error }
}
