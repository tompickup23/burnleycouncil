import { useState, useEffect, useRef } from 'react'

// --- Configuration ---
const CACHE_TTL_MS = 30 * 60 * 1000  // 30 minutes
const MAX_CACHE_ENTRIES = 50          // evict oldest when exceeded (protects mobile RAM)
const MAX_RETRIES = 2
const RETRY_BASE_MS = 1000           // exponential backoff: 1s, 2s

// Module-level cache shared across all components
// Each entry: { data, timestamp }
const cache = new Map()
const inflight = new Map()

// Resolve URLs relative to the Vite base path so the app works
// both at root (burnleycouncil.co.uk) and under a subpath (aidoge.co.uk/burnleycouncil/)
const BASE = import.meta.env.BASE_URL
function resolveUrl(url) {
  if (!url.startsWith('/')) return url
  return BASE + url.slice(1)
}

/** Check if a cache entry is still valid */
function isFresh(entry) {
  return entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS
}

/** Evict oldest entries when cache exceeds MAX_CACHE_ENTRIES */
function evictIfNeeded() {
  if (cache.size <= MAX_CACHE_ENTRIES) return
  // Map iterates in insertion order — first key is oldest
  const oldest = cache.keys().next().value
  cache.delete(oldest)
}

/** Fetch with retry + exponential backoff */
function fetchWithRetry(url, attempt = 0) {
  return fetch(resolveUrl(url)).then(r => {
    if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`)
    return r.json()
  }).catch(err => {
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt)
      return new Promise(resolve => setTimeout(resolve, delay))
        .then(() => fetchWithRetry(url, attempt + 1))
    }
    throw err
  })
}

/**
 * Custom hook for fetching and caching JSON data files.
 * - Deduplicates in-flight requests
 * - Caches results with a 30-minute TTL
 * - Retries failed fetches (2 retries with exponential backoff)
 * - Evicts oldest entries when cache exceeds 50 items
 *
 * @param {string|string[]} urls - URL or array of URLs to fetch
 * @returns {{ data: any, loading: boolean, error: Error|null }}
 */
export function useData(urls) {
  const isMultiple = Array.isArray(urls)
  const urlList = isMultiple ? urls : [urls]
  const keyStr = urlList.join('|')

  const [data, setData] = useState(() => {
    const allCached = urlList.every(u => {
      const entry = cache.get(u)
      return entry && isFresh(entry)
    })
    if (allCached) {
      const results = urlList.map(u => cache.get(u).data)
      return isMultiple ? results : results[0]
    }
    return null
  })

  const [loading, setLoading] = useState(() => {
    return !urlList.every(u => {
      const entry = cache.get(u)
      return entry && isFresh(entry)
    })
  })

  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    const allFresh = urlList.every(u => {
      const entry = cache.get(u)
      return entry && isFresh(entry)
    })
    if (allFresh) return

    const fetchUrl = (url) => {
      const entry = cache.get(url)
      if (entry && isFresh(entry)) {
        return Promise.resolve(entry.data)
      }

      // Deduplicate in-flight requests
      if (inflight.has(url)) {
        return inflight.get(url)
      }

      const promise = fetchWithRetry(url)
        .then(json => {
          cache.set(url, { data: json, timestamp: Date.now() })
          evictIfNeeded()
          inflight.delete(url)
          return json
        })
        .catch(err => {
          inflight.delete(url)
          throw err
        })

      inflight.set(url, promise)
      return promise
    }

    Promise.all(urlList.map(fetchUrl))
      .then(results => {
        if (!mountedRef.current) return
        setData(isMultiple ? results : results[0])
        setLoading(false)
        setError(null)
      })
      .catch(err => {
        if (!mountedRef.current) return
        console.error('Failed to load data:', err)
        setError(err)
        setLoading(false)
      })

    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyStr])

  return { data, loading, error }
}

/**
 * Preload data URLs into the cache without rendering.
 * Call this to warm the cache for routes the user is likely to visit.
 */
export function preloadData(urls) {
  const urlList = Array.isArray(urls) ? urls : [urls]
  urlList.forEach(url => {
    const entry = cache.get(url)
    if ((!entry || !isFresh(entry)) && !inflight.has(url)) {
      const promise = fetchWithRetry(url)
        .then(json => {
          cache.set(url, { data: json, timestamp: Date.now() })
          evictIfNeeded()
          inflight.delete(url)
          return json
        })
        .catch(() => {
          inflight.delete(url)
        })
      inflight.set(url, promise)
    }
  })
}

/**
 * Clear the entire data cache. Useful for forcing a refresh.
 */
export function clearCache() {
  cache.clear()
}
