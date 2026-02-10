import { useState, useEffect } from 'react'
import { useData } from './useData'

/**
 * Progressive spending data loader.
 * Fetches a year index, then loads per-year chunks newest-first.
 * Falls back to loading the full spending.json if chunks aren't available.
 */
export function useSpendingData() {
  const { data: yearIndex, loading: indexLoading, error: indexError } = useData('/data/spending-index.json')
  const [allRecords, setAllRecords] = useState([])
  const [loadedYears, setLoadedYears] = useState(0)
  const [totalYears, setTotalYears] = useState(0)
  const [progressLoading, setProgressLoading] = useState(true)

  useEffect(() => {
    if (!yearIndex) return
    setTotalYears(yearIndex.length)
    let cancelled = false

    async function loadChunks() {
      const records = []
      for (let i = 0; i < yearIndex.length; i++) {
        const fy = yearIndex[i].financial_year
        const slug = fy.replace('/', '-')
        const BASE = import.meta.env.BASE_URL
        try {
          const res = await fetch(`${BASE}data/spending-${slug}.json`)
          if (!res.ok) throw new Error(`${res.status}`)
          const chunk = await res.json()
          records.push(...chunk)
          if (cancelled) return
          setAllRecords([...records])
          setLoadedYears(i + 1)
        } catch {
          // If chunked loading fails, fall back to full file
          try {
            const res = await fetch(`${BASE}data/spending.json`)
            if (!res.ok) throw new Error(`${res.status}`)
            const full = await res.json()
            if (cancelled) return
            setAllRecords(full)
            setLoadedYears(yearIndex.length)
          } catch (e) {
            console.error('Failed to load spending data:', e)
          }
          break
        }
      }
      if (!cancelled) setProgressLoading(false)
    }
    loadChunks()
    return () => { cancelled = true }
  }, [yearIndex])

  return {
    data: allRecords,
    loading: indexLoading || (progressLoading && allRecords.length === 0),
    error: indexError,
    loadedYears,
    totalYears,
    progressLoading,
  }
}
