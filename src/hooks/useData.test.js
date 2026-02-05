/* eslint-disable no-undef */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useData, clearCache } from './useData'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchSuccess(data) {
  return vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(data),
    })
  )
}

function mockFetchFailure(status = 500) {
  return vi.fn(() =>
    Promise.resolve({
      ok: false,
      status,
      json: () => Promise.resolve({}),
    })
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useData', () => {
  beforeEach(() => {
    clearCache()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns loading state initially', () => {
    global.fetch = mockFetchSuccess({ items: [] })

    const { result } = renderHook(() => useData('/api/test.json'))

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('returns data after successful fetch', async () => {
    const mockData = { name: 'Burnley', population: 73000 }
    global.fetch = mockFetchSuccess(mockData)

    const { result } = renderHook(() => useData('/api/test.json'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toEqual(mockData)
    expect(result.current.error).toBeNull()
    expect(global.fetch).toHaveBeenCalledWith('/api/test.json')
  })

  it('handles fetch errors', async () => {
    // Suppress console.error output during this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    global.fetch = mockFetchFailure(404)

    const { result } = renderHook(() => useData('/api/missing.json'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error.message).toContain('404')
    expect(result.current.data).toBeNull()

    consoleSpy.mockRestore()
  })

  it('returns cached data immediately on second call', async () => {
    const mockData = { council: 'Burnley' }
    global.fetch = mockFetchSuccess(mockData)

    // First render: fetches from network
    const { result: result1, unmount } = renderHook(() =>
      useData('/api/cached.json')
    )

    await waitFor(() => {
      expect(result1.current.loading).toBe(false)
    })

    expect(result1.current.data).toEqual(mockData)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    unmount()

    // Second render: should come from cache, no additional fetch
    const { result: result2 } = renderHook(() => useData('/api/cached.json'))

    // Data should be available immediately (initialised from cache)
    expect(result2.current.loading).toBe(false)
    expect(result2.current.data).toEqual(mockData)

    // fetch should not have been called again
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('handles multiple URLs', async () => {
    const data1 = { file: 'one' }
    const data2 = { file: 'two' }

    global.fetch = vi.fn((url) => {
      const body = url.includes('one') ? data1 : data2
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
      })
    })

    const { result } = renderHook(() =>
      useData(['/api/one.json', '/api/two.json'])
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toEqual([data1, data2])
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
