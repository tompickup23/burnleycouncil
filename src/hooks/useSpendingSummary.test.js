/* eslint-disable no-undef */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock CouncilConfig — must be before import
// ---------------------------------------------------------------------------
let mockConfig = { data_sources: { spending: true }, spending: true }
vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: () => mockConfig,
}))

// ---------------------------------------------------------------------------
// Mock Worker
// ---------------------------------------------------------------------------
let workerOnMessage = null
let workerPostMessage = null

class MockWorker {
  constructor() {
    this.onmessage = null
    this.onerror = null
    workerPostMessage = vi.fn((msg) => {
      // Simulate worker message flow
      if (msg.type === 'INIT') {
        setTimeout(() => {
          if (this.onmessage) {
            this.onmessage({ data: { type: 'READY', chunked: false, monthly: false } })
          }
        }, 10)
      }
      if (msg.type === 'COMPUTE_SUMMARY') {
        setTimeout(() => {
          if (this.onmessage) {
            this.onmessage({
              data: {
                type: 'SUMMARY_RESULT',
                summary: {
                  total_spend: 1000000,
                  total_income: -200000,
                  record_count: 500,
                  by_portfolio: { adult_social_care: { total: 500000, count: 200 } },
                  by_month: [{ month: '2024-04', total: 100000 }],
                  top_suppliers: [{ name: 'Supplier A', total: 100000 }],
                  coverage: { classified: 400, unclassified: 100, pct: 80 },
                },
              },
            })
          }
        }, 10)
      }
    })
    this.postMessage = workerPostMessage
    this.terminate = vi.fn()
    workerOnMessage = (data) => {
      if (this.onmessage) this.onmessage({ data })
    }
  }
}

// Store original Worker
const OriginalWorker = globalThis.Worker

// ---------------------------------------------------------------------------
// Module-level cache reset helper
// ---------------------------------------------------------------------------
// The hook uses module-level variables for caching, so we need to re-import
// the module fresh for certain tests. For simplicity, we test observable behaviour.

let useSpendingSummary

async function freshImport() {
  // Clear module cache to reset singleton state
  const modules = Object.keys(vi._moduleCache || {})
  for (const key of modules) {
    if (key.includes('useSpendingSummary')) {
      delete vi._moduleCache[key]
    }
  }
  const mod = await import('./useSpendingSummary.js')
  useSpendingSummary = mod.useSpendingSummary
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSpendingSummary', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    mockConfig = { data_sources: { spending: true }, spending: true }
    globalThis.Worker = MockWorker

    // Dynamic re-import to reset module-level cache
    // Use vi.resetModules() to clear cached modules
    vi.resetModules()
    vi.mock('../context/CouncilConfig', () => ({
      useCouncilConfig: () => mockConfig,
    }))
    const mod = await import('./useSpendingSummary.js')
    useSpendingSummary = mod.useSpendingSummary
  })

  afterEach(() => {
    globalThis.Worker = OriginalWorker
    vi.restoreAllMocks()
  })

  it('returns loading state initially when spending enabled', () => {
    const { result } = renderHook(() => useSpendingSummary())
    // Initially loading (no cached summary)
    expect(result.current.loading).toBe(true)
    expect(result.current.summary).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('returns not-loading when spending disabled', () => {
    mockConfig = { data_sources: { spending: false }, spending: false }
    const { result } = renderHook(() => useSpendingSummary())
    expect(result.current.loading).toBe(false)
    expect(result.current.summary).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('returns not-loading when config has no spending data source', () => {
    mockConfig = { spending: false }
    const { result } = renderHook(() => useSpendingSummary())
    expect(result.current.loading).toBe(false)
    expect(result.current.summary).toBeNull()
  })

  it('loads summary via worker when spending enabled', async () => {
    const { result } = renderHook(() => useSpendingSummary())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 2000 })

    expect(result.current.summary).not.toBeNull()
    expect(result.current.summary.total_spend).toBe(1000000)
    expect(result.current.summary.record_count).toBe(500)
    expect(result.current.summary.by_portfolio.adult_social_care.total).toBe(500000)
    expect(result.current.error).toBeNull()
  })

  it('summary includes coverage data', async () => {
    const { result } = renderHook(() => useSpendingSummary())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 2000 })

    expect(result.current.summary.coverage.pct).toBe(80)
    expect(result.current.summary.coverage.classified).toBe(400)
  })

  it('summary includes top suppliers', async () => {
    const { result } = renderHook(() => useSpendingSummary())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 2000 })

    expect(result.current.summary.top_suppliers).toHaveLength(1)
    expect(result.current.summary.top_suppliers[0].name).toBe('Supplier A')
  })

  it('summary includes monthly data', async () => {
    const { result } = renderHook(() => useSpendingSummary())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 2000 })

    expect(result.current.summary.by_month).toHaveLength(1)
    expect(result.current.summary.by_month[0].month).toBe('2024-04')
  })

  it('handles worker error gracefully', async () => {
    // Override Worker to simulate error
    globalThis.Worker = class ErrorWorker {
      constructor() {
        this.onmessage = null
        this.onerror = null
        this.postMessage = vi.fn((msg) => {
          if (msg.type === 'INIT') {
            setTimeout(() => {
              if (this.onmessage) {
                this.onmessage({ data: { type: 'ERROR', message: 'Test error' } })
              }
            }, 10)
          }
        })
        this.terminate = vi.fn()
      }
    }

    // Re-import with fresh module cache
    vi.resetModules()
    vi.mock('../context/CouncilConfig', () => ({
      useCouncilConfig: () => mockConfig,
    }))
    const mod = await import('./useSpendingSummary.js')

    const { result } = renderHook(() => mod.useSpendingSummary())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 2000 })

    expect(result.current.summary).toBeNull()
    expect(result.current.error).not.toBeNull()
    expect(result.current.error.message).toBe('Test error')
  })

  it('handles worker onerror gracefully', async () => {
    globalThis.Worker = class CrashWorker {
      constructor() {
        this.onmessage = null
        this.onerror = null
        this.postMessage = vi.fn(() => {
          setTimeout(() => {
            if (this.onerror) {
              this.onerror({ message: 'Worker crashed' })
            }
          }, 10)
        })
        this.terminate = vi.fn()
      }
    }

    vi.resetModules()
    vi.mock('../context/CouncilConfig', () => ({
      useCouncilConfig: () => mockConfig,
    }))
    const mod = await import('./useSpendingSummary.js')

    const { result } = renderHook(() => mod.useSpendingSummary())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 2000 })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error.message).toBe('Worker crashed')
  })

  it('requests LOAD_ALL_YEARS for chunked data before summary', async () => {
    globalThis.Worker = class ChunkedWorker {
      constructor() {
        this.onmessage = null
        this.onerror = null
        this.messages = []
        this.postMessage = vi.fn((msg) => {
          this.messages.push(msg)
          if (msg.type === 'INIT') {
            setTimeout(() => {
              if (this.onmessage) {
                this.onmessage({ data: { type: 'READY', chunked: true, monthly: false } })
              }
            }, 10)
          }
          if (msg.type === 'LOAD_ALL_YEARS') {
            setTimeout(() => {
              if (this.onmessage) {
                this.onmessage({ data: { type: 'ALL_YEARS_LOADED' } })
              }
            }, 10)
          }
          if (msg.type === 'COMPUTE_SUMMARY') {
            setTimeout(() => {
              if (this.onmessage) {
                this.onmessage({
                  data: {
                    type: 'SUMMARY_RESULT',
                    summary: { total_spend: 2000000, record_count: 1000, by_portfolio: {}, coverage: { pct: 90 } },
                  },
                })
              }
            }, 10)
          }
        })
        this.terminate = vi.fn()
      }
    }

    vi.resetModules()
    vi.mock('../context/CouncilConfig', () => ({
      useCouncilConfig: () => mockConfig,
    }))
    const mod = await import('./useSpendingSummary.js')

    const { result } = renderHook(() => mod.useSpendingSummary())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 3000 })

    expect(result.current.summary.total_spend).toBe(2000000)
  })

  it('handles null config gracefully — defaults to spending enabled', () => {
    mockConfig = null
    const { result } = renderHook(() => useSpendingSummary())
    // null config → opt-out pattern means spending defaults to enabled
    // (only disabled when explicitly set to false)
    expect(result.current.loading).toBe(true)
    expect(result.current.summary).toBeNull()
  })

  it('ignores LOADING progress messages', async () => {
    globalThis.Worker = class ProgressWorker {
      constructor() {
        this.onmessage = null
        this.onerror = null
        this.postMessage = vi.fn((msg) => {
          if (msg.type === 'INIT') {
            setTimeout(() => {
              if (this.onmessage) {
                // Send progress messages first
                this.onmessage({ data: { type: 'LOADING', progress: 50 } })
                this.onmessage({ data: { type: 'YEAR_LOADING', year: '2024' } })
                // Then READY
                this.onmessage({ data: { type: 'READY', chunked: false, monthly: false } })
              }
            }, 10)
          }
          if (msg.type === 'COMPUTE_SUMMARY') {
            setTimeout(() => {
              if (this.onmessage) {
                this.onmessage({
                  data: {
                    type: 'SUMMARY_RESULT',
                    summary: { total_spend: 500000, record_count: 100, by_portfolio: {}, coverage: { pct: 50 } },
                  },
                })
              }
            }, 10)
          }
        })
        this.terminate = vi.fn()
      }
    }

    vi.resetModules()
    vi.mock('../context/CouncilConfig', () => ({
      useCouncilConfig: () => mockConfig,
    }))
    const mod = await import('./useSpendingSummary.js')

    const { result } = renderHook(() => mod.useSpendingSummary())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 2000 })

    // Summary should still load successfully despite progress messages
    expect(result.current.summary.total_spend).toBe(500000)
  })

  it('warns but continues on chunk load failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    globalThis.Worker = class PartialFailWorker {
      constructor() {
        this.onmessage = null
        this.onerror = null
        this.postMessage = vi.fn((msg) => {
          if (msg.type === 'INIT') {
            setTimeout(() => {
              if (this.onmessage) {
                this.onmessage({ data: { type: 'READY', chunked: false, monthly: false } })
              }
            }, 10)
          }
          if (msg.type === 'COMPUTE_SUMMARY') {
            setTimeout(() => {
              if (this.onmessage) {
                // Emit a non-fatal load error
                this.onmessage({ data: { type: 'ERROR', message: 'Failed to load chunk 2024-05' } })
                // Then succeed
                this.onmessage({
                  data: {
                    type: 'SUMMARY_RESULT',
                    summary: { total_spend: 300000, record_count: 50, by_portfolio: {}, coverage: { pct: 40 } },
                  },
                })
              }
            }, 10)
          }
        })
        this.terminate = vi.fn()
      }
    }

    vi.resetModules()
    vi.mock('../context/CouncilConfig', () => ({
      useCouncilConfig: () => mockConfig,
    }))
    const mod = await import('./useSpendingSummary.js')

    const { result } = renderHook(() => mod.useSpendingSummary())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 2000 })

    // Should still succeed with partial data
    expect(result.current.summary.total_spend).toBe(300000)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
