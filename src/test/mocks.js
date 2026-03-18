/**
 * Shared test mock data — import into test files instead of duplicating.
 *
 * Usage:
 *   import { mockCouncilConfig, mockCouncilConfigFull } from '../test/mocks'
 *   useCouncilConfig.mockReturnValue(mockCouncilConfig)
 */

// --- Council Config Mocks ---

/** Minimal config — sufficient for most page tests */
export const mockCouncilConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
}

/** Config with data_sources flags */
export const mockCouncilConfigWithData = {
  ...mockCouncilConfig,
  council_tier: 'district',
  data_sources: {
    budgets: true,
    spending: true,
    foi: true,
    meetings: true,
    collection_rates: true,
    ward_boundaries: true,
    deprivation: true,
  },
}

/** Full config including DOGE context and feature flags */
export const mockCouncilConfigFull = {
  ...mockCouncilConfigWithData,
  doge_context: { population: 90000 },
  features: {
    cabinet_portfolios: false,
    executive_view: false,
    highways: false,
    property_assets: false,
  },
}

/** LCC config for Cabinet Command tests */
export const mockLCCConfig = {
  council_id: 'lancashire_cc',
  council_name: 'Lancashire',
  council_full_name: 'Lancashire County Council',
  official_website: 'https://lancashire.gov.uk',
  spending_threshold: 500,
  council_tier: 'county',
  data_sources: {
    budgets: true,
    spending: true,
    foi: true,
    meetings: true,
    collection_rates: true,
    ward_boundaries: true,
  },
  features: {
    cabinet_portfolios: true,
    executive_view: true,
    highways: true,
    property_assets: true,
  },
}

// --- useData Mock Helper ---

/** Create a useData return value */
export function mockDataReturn(data, { loading = false, error = null } = {}) {
  return { data, loading, error }
}

export const mockDataLoading = { data: null, loading: true, error: null }
export const mockDataError = { data: null, loading: false, error: new Error('Failed to load') }
export const mockDataNull = { data: null, loading: false, error: null }
