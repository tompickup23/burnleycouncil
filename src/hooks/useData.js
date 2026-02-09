import { useState, useEffect, useRef } from 'react'

// Module-level cache shared across all components
const cache = new Map()
const inflight = new Map()

// Resolve URLs relative to the Vite base path so the app works
// both at root (burnleycouncil.co.uk) and under a subpath (aidoge.co.uk/burnleycouncil/)
const BASE = import.meta.env.BASE_URL
function resolveUrl(url) {
  if (!url.startsWith('/')) return url
  // BASE always ends with '/', so strip the leading '/' from the url
  return BASE + url.slice(1)
}

/**
 * Custom hook for fetching and caching JSON data files.
 * Deduplicates in-flight requests and caches results in memory.
 * Data persists across navigations until page refresh.
 *
 * @param {string|string[]} urls - URL or array of URLs to fetch
 * @returns {{ data: any, loading: boolean, error: Error|null }}
 */
export function useData(urls) {
  const isMultiple = Array.isArray(urls)
  const urlList = isMultiple ? urls : [urls]
  const keyStr = urlList.join('|')

  const [data, setData] = useState(() => {
    // Initialize from cache if all URLs are cached
    const allCached = urlList.every(u => cache.has(u))
    if (allCached) {
      const results = urlList.map(u => cache.get(u))
      return isMultiple ? results : results[0]
    }
    return null
  })

  const [loading, setLoading] = useState(() => {
    return !urlList.every(u => cache.has(u))
  })

  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    // Already have everything cached — skip fetch
    if (urlList.every(u => cache.has(u))) {
      return
    }

    const fetchUrl = (url) => {
      if (cache.has(url)) {
        return Promise.resolve(cache.get(url))
      }

      // Deduplicate in-flight requests
      if (inflight.has(url)) {
        return inflight.get(url)
      }

      const promise = fetch(resolveUrl(url))
        .then(r => {
          if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`)
          return r.json()
        })
        .then(json => {
          cache.set(url, json)
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
    if (!cache.has(url) && !inflight.has(url)) {
      const promise = fetch(resolveUrl(url))
        .then(r => {
          if (!r.ok) throw new Error(`Preload failed ${url}: ${r.status}`)
          return r.json()
        })
        .then(json => {
          cache.set(url, json)
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
