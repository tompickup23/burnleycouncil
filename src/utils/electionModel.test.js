import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ASSUMPTIONS,
  getBaseline,
  calculateNationalSwing,
  calculateDemographicAdjustments,
  calculateIncumbencyAdjustment,
  calculateReformEntry,
  normaliseShares,
  predictWard,
  predictCouncil,
  applyOverrides,
  computeCoalitions,
  projectToLGRAuthority,
} from './electionModel'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockWardHistory = {
  history: [
    {
      date: '2024-05-02',
      year: 2024,
      type: 'borough',
      seats_contested: 1,
      turnout_votes: 1823,
      turnout: 0.312,
      electorate: 5842,
      candidates: [
        { name: 'Alice', party: 'Labour', votes: 742, pct: 0.407, elected: true },
        { name: 'Bob', party: 'Conservative', votes: 538, pct: 0.295, elected: false },
        { name: 'Carol', party: 'Green Party', votes: 343, pct: 0.188, elected: false },
        { name: 'Dave', party: 'Liberal Democrats', votes: 200, pct: 0.110, elected: false },
      ],
      majority: 204,
      majority_pct: 0.112,
    },
    {
      date: '2021-05-06',
      year: 2021,
      type: 'borough',
      seats_contested: 1,
      turnout_votes: 1500,
      turnout: 0.260,
      electorate: 5770,
      candidates: [
        { name: 'Alice', party: 'Labour', votes: 650, pct: 0.433, elected: true },
        { name: 'Eve', party: 'Conservative', votes: 450, pct: 0.300, elected: false },
        { name: 'Frank', party: 'Green Party', votes: 400, pct: 0.267, elected: false },
      ],
      majority: 200,
    },
  ],
  current_holders: [{ name: 'Alice Smith', party: 'Labour' }],
  seats: 3,
  electorate: 5842,
}

const mockCountyWard = {
  history: [
    {
      date: '2021-05-06',
      year: 2021,
      type: 'county',
      seats_contested: 1,
      turnout_votes: 3000,
      turnout: 0.28,
      electorate: 10714,
      candidates: [
        { name: 'X', party: 'Conservative', votes: 1200, pct: 0.400, elected: true },
        { name: 'Y', party: 'Labour', votes: 1000, pct: 0.333, elected: false },
        { name: 'Z', party: 'Liberal Democrats', votes: 800, pct: 0.267, elected: false },
      ],
    },
  ],
  current_holders: [{ name: 'X', party: 'Conservative' }],
}

const nationalPolling = { Labour: 0.29, Conservative: 0.24, 'Reform UK': 0.22, 'Liberal Democrats': 0.12, 'Green Party': 0.07 }
const ge2024Result = { Labour: 0.337, Conservative: 0.237, 'Reform UK': 0.143, 'Liberal Democrats': 0.122, 'Green Party': 0.069 }

// ---------------------------------------------------------------------------
// DEFAULT_ASSUMPTIONS
// ---------------------------------------------------------------------------

describe('DEFAULT_ASSUMPTIONS', () => {
  it('has all required fields', () => {
    expect(DEFAULT_ASSUMPTIONS).toHaveProperty('nationalToLocalDampening', 0.65)
    expect(DEFAULT_ASSUMPTIONS).toHaveProperty('incumbencyBonusPct', 0.05)
    expect(DEFAULT_ASSUMPTIONS).toHaveProperty('retirementPenaltyPct', -0.02)
    expect(DEFAULT_ASSUMPTIONS).toHaveProperty('reformProxyWeights')
    expect(DEFAULT_ASSUMPTIONS.reformProxyWeights).toEqual({ ge: 0.4, lcc: 0.6 })
  })
})

// ---------------------------------------------------------------------------
// getBaseline
// ---------------------------------------------------------------------------

describe('getBaseline', () => {
  it('returns most recent borough election by default', () => {
    const result = getBaseline(mockWardHistory)
    expect(result).not.toBeNull()
    expect(result.year).toBe(2024)
    expect(result.date).toBe('2024-05-02')
  })

  it('returns party vote shares', () => {
    const result = getBaseline(mockWardHistory)
    expect(result.parties).toHaveProperty('Labour')
    expect(result.parties.Labour).toBeCloseTo(0.407, 2)
    expect(result.parties.Conservative).toBeCloseTo(0.295, 2)
  })

  it('returns null for empty ward', () => {
    expect(getBaseline({ history: [] })).toBeNull()
    expect(getBaseline({})).toBeNull()
    expect(getBaseline(null)).toBeNull()
  })

  it('filters by election type', () => {
    const result = getBaseline(mockCountyWard, 'county')
    expect(result).not.toBeNull()
    expect(result.parties.Conservative).toBeCloseTo(0.400, 2)
  })

  it('falls back to most recent if type not found', () => {
    const result = getBaseline(mockCountyWard, 'borough')
    expect(result).not.toBeNull()
    // Should still return the county election as fallback
    expect(result.year).toBe(2021)
  })

  it('returns turnout and electorate', () => {
    const result = getBaseline(mockWardHistory)
    expect(result.turnout).toBe(0.312)
    expect(result.electorate).toBe(5842)
    expect(result.turnoutVotes).toBe(1823)
  })
})

// ---------------------------------------------------------------------------
// calculateNationalSwing
// ---------------------------------------------------------------------------

describe('calculateNationalSwing', () => {
  const baseline = { Labour: 0.407, Conservative: 0.295, 'Green Party': 0.188, 'Liberal Democrats': 0.110 }

  it('calculates dampened swing for each party', () => {
    const result = calculateNationalSwing(baseline, nationalPolling, ge2024Result, DEFAULT_ASSUMPTIONS)
    expect(result.adjustments).toBeDefined()
    // Labour: 0.29 - 0.337 = -0.047, dampened × 0.65 = -0.0306
    expect(result.adjustments.Labour).toBeCloseTo(-0.0306, 3)
    // Conservative: 0.24 - 0.237 = 0.003, dampened = 0.00195
    expect(result.adjustments.Conservative).toBeCloseTo(0.00195, 3)
  })

  it('includes methodology object', () => {
    const result = calculateNationalSwing(baseline, nationalPolling, ge2024Result, DEFAULT_ASSUMPTIONS)
    expect(result.methodology.step).toBe(2)
    expect(result.methodology.name).toBe('National Swing')
    expect(result.methodology.details).toBeDefined()
  })

  it('respects swing multiplier', () => {
    const doubled = { ...DEFAULT_ASSUMPTIONS, swingMultiplier: 2.0 }
    const result = calculateNationalSwing(baseline, nationalPolling, ge2024Result, doubled)
    const normal = calculateNationalSwing(baseline, nationalPolling, ge2024Result, DEFAULT_ASSUMPTIONS)
    expect(Math.abs(result.adjustments.Labour)).toBeCloseTo(Math.abs(normal.adjustments.Labour) * 2, 3)
  })

  it('handles missing national polling for a party', () => {
    const result = calculateNationalSwing(baseline, {}, ge2024Result, DEFAULT_ASSUMPTIONS)
    // All adjustments should be negative (0 - ge2024 result, dampened)
    expect(result.adjustments.Labour).toBeLessThanOrEqual(0)
  })
})

// ---------------------------------------------------------------------------
// calculateDemographicAdjustments
// ---------------------------------------------------------------------------

describe('calculateDemographicAdjustments', () => {
  it('returns empty adjustments when no demographic data', () => {
    const result = calculateDemographicAdjustments(null, null, null)
    expect(Object.keys(result.adjustments)).toHaveLength(0)
    expect(result.methodology.step).toBe(3)
  })

  it('applies high deprivation bonus for Labour', () => {
    const deprivation = { avg_imd_decile: 1 }
    const result = calculateDemographicAdjustments(null, deprivation, null)
    expect(result.adjustments.Labour).toBe(0.02)
    expect(result.adjustments.Conservative).toBe(-0.02)
  })

  it('applies over-65 bonus', () => {
    const demographics = { age_65_plus_pct: 0.30 }
    const result = calculateDemographicAdjustments(demographics, null, null)
    expect(result.adjustments.Conservative).toBe(0.015)
    expect(result.adjustments['Reform UK']).toBe(0.01)
  })

  it('applies Asian heritage independent bonus', () => {
    const demographics = { asian_pct: 0.25 }
    const result = calculateDemographicAdjustments(demographics, null, null)
    expect(result.adjustments.Independent).toBe(0.02)
  })

  it('does not trigger for moderate values', () => {
    const demographics = { age_65_plus_pct: 0.20, asian_pct: 0.10 }
    const deprivation = { avg_imd_decile: 5 }
    const result = calculateDemographicAdjustments(demographics, deprivation, null)
    expect(Object.keys(result.adjustments)).toHaveLength(0)
  })

  it('includes methodology factors', () => {
    const deprivation = { avg_imd_decile: 2 }
    const result = calculateDemographicAdjustments(null, deprivation, null)
    expect(result.methodology.factors).toHaveLength(1)
    expect(result.methodology.factors[0]).toContain('deprivation')
  })
})

// ---------------------------------------------------------------------------
// calculateIncumbencyAdjustment
// ---------------------------------------------------------------------------

describe('calculateIncumbencyAdjustment', () => {
  it('gives incumbency bonus to sitting party', () => {
    const result = calculateIncumbencyAdjustment(mockWardHistory, DEFAULT_ASSUMPTIONS)
    expect(result.adjustments.Labour).toBe(0.05)
    expect(result.methodology.step).toBe(4)
  })

  it('returns empty adjustments when no holders', () => {
    const result = calculateIncumbencyAdjustment({ current_holders: [] }, DEFAULT_ASSUMPTIONS)
    expect(Object.keys(result.adjustments)).toHaveLength(0)
  })

  it('returns empty adjustments for null wardData', () => {
    const result = calculateIncumbencyAdjustment(null, DEFAULT_ASSUMPTIONS)
    expect(Object.keys(result.adjustments)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// calculateReformEntry
// ---------------------------------------------------------------------------

describe('calculateReformEntry', () => {
  const baselineNoReform = { Labour: 0.407, Conservative: 0.295, 'Green Party': 0.188, 'Liberal Democrats': 0.110 }
  const baselineWithReform = { Labour: 0.35, Conservative: 0.25, 'Reform UK': 0.15, 'Green Party': 0.15, 'Liberal Democrats': 0.10 }
  const lcc2025 = { results: { 'Reform UK': { pct: 0.357 } } }
  const constituency = { 'Reform UK': 0.20 }

  it('estimates Reform from proxy when not in baseline', () => {
    const result = calculateReformEntry(baselineNoReform, constituency, lcc2025, DEFAULT_ASSUMPTIONS)
    // (0.20 × 0.4 + 0.357 × 0.6) × 0.85 = (0.08 + 0.2142) × 0.85 = 0.2502
    expect(result.reformEstimate).toBeCloseTo(0.2502, 2)
    expect(result.adjustments['Reform UK']).toBeCloseTo(0.2502, 2)
  })

  it('takes from other parties proportionally', () => {
    const result = calculateReformEntry(baselineNoReform, constituency, lcc2025, DEFAULT_ASSUMPTIONS)
    // Labour has 40.7% of total, should lose 40.7% of Reform estimate
    const labourLoss = result.reformEstimate * (0.407 / 1.0)
    expect(result.adjustments.Labour).toBeCloseTo(-labourLoss, 2)
  })

  it('skips proxy when Reform already in baseline', () => {
    const result = calculateReformEntry(baselineWithReform, constituency, lcc2025, DEFAULT_ASSUMPTIONS)
    expect(result.reformEstimate).toBe(0.15)
    expect(Object.keys(result.adjustments)).toHaveLength(0)
  })

  it('returns zero when Reform not standing', () => {
    const noReform = { ...DEFAULT_ASSUMPTIONS, reformStandsInAllWards: false }
    const result = calculateReformEntry(baselineNoReform, constituency, lcc2025, noReform)
    expect(result.reformEstimate).toBe(0)
  })

  it('includes methodology step 5', () => {
    const result = calculateReformEntry(baselineNoReform, constituency, lcc2025, DEFAULT_ASSUMPTIONS)
    expect(result.methodology.step).toBe(5)
    expect(result.methodology.name).toBe('New Party Entry')
  })
})

// ---------------------------------------------------------------------------
// normaliseShares
// ---------------------------------------------------------------------------

describe('normaliseShares', () => {
  it('scales shares to sum to 1.0', () => {
    const result = normaliseShares({ A: 0.4, B: 0.3, C: 0.3 })
    const total = Object.values(result).reduce((s, v) => s + v, 0)
    expect(total).toBeCloseTo(1.0, 5)
  })

  it('handles negative values by clamping to 0', () => {
    const result = normaliseShares({ A: 0.5, B: -0.1, C: 0.6 })
    expect(result.B).toBe(0)
    const total = Object.values(result).reduce((s, v) => s + v, 0)
    expect(total).toBeCloseTo(1.0, 5)
  })

  it('handles all zeros', () => {
    const result = normaliseShares({ A: 0, B: 0 })
    expect(result.A).toBe(0)
    expect(result.B).toBe(0)
  })

  it('preserves relative proportions', () => {
    const result = normaliseShares({ A: 2, B: 1, C: 1 })
    expect(result.A).toBeCloseTo(0.5, 5)
    expect(result.B).toBeCloseTo(0.25, 5)
  })
})

// ---------------------------------------------------------------------------
// predictWard
// ---------------------------------------------------------------------------

describe('predictWard', () => {
  const lcc2025 = { results: { 'Reform UK': { pct: 0.357 } } }

  it('returns prediction with all methodology steps', () => {
    const result = predictWard(mockWardHistory, DEFAULT_ASSUMPTIONS, nationalPolling, ge2024Result, null, null, null, lcc2025)
    expect(result.prediction).not.toBeNull()
    expect(result.methodology).toHaveLength(6)
    expect(result.methodology.map(m => m.step)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('returns a winner', () => {
    const result = predictWard(mockWardHistory, DEFAULT_ASSUMPTIONS, nationalPolling, ge2024Result, null, null, null, lcc2025)
    expect(result.winner).toBeDefined()
    expect(result.majority).toBeGreaterThanOrEqual(0)
  })

  it('has confidence level', () => {
    const result = predictWard(mockWardHistory, DEFAULT_ASSUMPTIONS, nationalPolling, ge2024Result)
    expect(['high', 'medium', 'low']).toContain(result.confidence)
  })

  it('estimates votes and turnout', () => {
    const result = predictWard(mockWardHistory, DEFAULT_ASSUMPTIONS, nationalPolling, ge2024Result)
    expect(result.estimatedTurnout).toBeGreaterThan(0.1)
    expect(result.estimatedTurnout).toBeLessThan(0.7)
    expect(result.estimatedVotes).toBeGreaterThan(0)
  })

  it('returns none confidence for empty ward', () => {
    const result = predictWard({ history: [] })
    expect(result.prediction).toBeNull()
    expect(result.confidence).toBe('none')
  })

  it('predictions sum to approximately 100%', () => {
    const result = predictWard(mockWardHistory, DEFAULT_ASSUMPTIONS, nationalPolling, ge2024Result)
    const totalPct = Object.values(result.prediction).reduce((s, v) => s + v.pct, 0)
    expect(totalPct).toBeCloseTo(1.0, 1)
  })

  it('turnout adjustment affects estimated turnout', () => {
    const highTurnout = { ...DEFAULT_ASSUMPTIONS, turnoutAdjustment: 0.05 }
    const lowTurnout = { ...DEFAULT_ASSUMPTIONS, turnoutAdjustment: -0.05 }
    const high = predictWard(mockWardHistory, highTurnout, nationalPolling, ge2024Result)
    const low = predictWard(mockWardHistory, lowTurnout, nationalPolling, ge2024Result)
    expect(high.estimatedTurnout).toBeGreaterThan(low.estimatedTurnout)
  })
})

// ---------------------------------------------------------------------------
// predictCouncil
// ---------------------------------------------------------------------------

describe('predictCouncil', () => {
  const mockElectionsData = {
    wards: {
      'Ward A': { ...mockWardHistory },
      'Ward B': {
        ...mockWardHistory,
        current_holders: [{ name: 'Bob', party: 'Conservative' }],
      },
      'Ward C': {
        history: [{
          date: '2022-05-05', year: 2022, type: 'borough',
          turnout_votes: 1500, turnout: 0.30, electorate: 5000,
          candidates: [
            { name: 'X', party: 'Conservative', votes: 800, pct: 0.533, elected: true },
            { name: 'Y', party: 'Labour', votes: 700, pct: 0.467, elected: false },
          ],
        }],
        current_holders: [{ name: 'X', party: 'Conservative' }],
      },
    },
  }

  it('predicts specified wards and counts non-contested seats', () => {
    const result = predictCouncil(
      mockElectionsData,
      ['Ward A', 'Ward B'],
      DEFAULT_ASSUMPTIONS,
      nationalPolling,
      ge2024Result,
    )
    expect(Object.keys(result.wards)).toHaveLength(2)
    expect(result.seatTotals).toBeDefined()
    expect(result.totalSeats).toBeGreaterThan(0)
  })

  it('includes non-contested ward holders in seat totals', () => {
    const result = predictCouncil(
      mockElectionsData,
      ['Ward A'], // Only predict Ward A
      DEFAULT_ASSUMPTIONS,
      nationalPolling,
      ge2024Result,
    )
    // Ward B and C are not up — their holders should be counted
    expect(result.seatTotals.Conservative || 0).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// applyOverrides
// ---------------------------------------------------------------------------

describe('applyOverrides', () => {
  it('swaps ward winner', () => {
    const councilResult = {
      wards: {
        'Ward A': { winner: 'Labour' },
        'Ward B': { winner: 'Conservative' },
      },
      seatTotals: { Labour: 10, Conservative: 8 },
    }

    const result = applyOverrides(councilResult, { 'Ward A': 'Reform UK' }, 18)
    expect(result.Labour).toBe(9) // Lost 1
    expect(result['Reform UK']).toBe(1) // Gained 1
    expect(result.Conservative).toBe(8) // Unchanged
  })

  it('removes party from totals when seats drop to zero', () => {
    const councilResult = {
      wards: { 'Ward A': { winner: 'Green Party' } },
      seatTotals: { 'Green Party': 1, Labour: 10 },
    }

    const result = applyOverrides(councilResult, { 'Ward A': 'Labour' }, 11)
    expect(result['Green Party']).toBeUndefined()
    expect(result.Labour).toBe(11)
  })

  it('handles empty overrides', () => {
    const councilResult = {
      wards: {},
      seatTotals: { Labour: 10 },
    }
    const result = applyOverrides(councilResult, {}, 10)
    expect(result.Labour).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// computeCoalitions
// ---------------------------------------------------------------------------

describe('computeCoalitions', () => {
  it('finds single-party majority', () => {
    const result = computeCoalitions({ Labour: 25, Conservative: 15, 'Liberal Democrats': 5 }, 23)
    expect(result.some(c => c.type === 'majority' && c.parties.includes('Labour'))).toBe(true)
  })

  it('finds two-party coalitions', () => {
    const result = computeCoalitions({ Labour: 15, Conservative: 12, 'Green Party': 8, 'Liberal Democrats': 5 }, 21)
    expect(result.some(c => c.parties.length === 2)).toBe(true)
  })

  it('finds three-party coalitions when needed', () => {
    const result = computeCoalitions({ A: 8, B: 7, C: 6, D: 5 }, 20)
    expect(result.some(c => c.parties.length === 3)).toBe(true)
  })

  it('returns empty when no coalition possible', () => {
    const result = computeCoalitions({ A: 5, B: 3 }, 100)
    expect(result).toHaveLength(0)
  })

  it('calculates majority correctly', () => {
    const result = computeCoalitions({ Labour: 30 }, 23)
    const majorityCoalition = result.find(c => c.parties.includes('Labour'))
    expect(majorityCoalition.majority).toBe(8) // 30 - 23 + 1 = 8
  })

  it('sorts by total seats descending', () => {
    const result = computeCoalitions({ A: 15, B: 12, C: 10, D: 8 }, 20)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].totalSeats).toBeLessThanOrEqual(result[i - 1].totalSeats)
    }
  })
})

// ---------------------------------------------------------------------------
// projectToLGRAuthority
// ---------------------------------------------------------------------------

describe('projectToLGRAuthority', () => {
  const lgrModel = {
    authorities: [
      { name: 'East Lancashire', councils: ['burnley', 'hyndburn', 'pendle', 'rossendale'] },
      { name: 'Central Lancashire', councils: ['preston', 'chorley', 'south_ribble'] },
    ],
  }

  const seatTotals = {
    burnley: { Labour: 23, Independent: 12, 'Liberal Democrats': 10 },
    hyndburn: { Labour: 21, Conservative: 13 },
    pendle: { Conservative: 21, Labour: 15, 'Liberal Democrats': 13 },
    rossendale: { Labour: 18, Conservative: 12, 'Green Party': 6 },
    preston: { Labour: 26, Conservative: 10, 'Liberal Democrats': 12 },
    chorley: { Labour: 36, Conservative: 6 },
    south_ribble: { Labour: 28, Conservative: 15, 'Liberal Democrats': 7 },
  }

  it('combines seat totals per authority', () => {
    const result = projectToLGRAuthority(seatTotals, lgrModel)
    expect(result['East Lancashire']).toBeDefined()
    expect(result['East Lancashire'].seats.Labour).toBe(23 + 21 + 15 + 18) // 77
  })

  it('calculates majority threshold', () => {
    const result = projectToLGRAuthority(seatTotals, lgrModel)
    const east = result['East Lancashire']
    expect(east.majorityThreshold).toBe(Math.floor(east.totalSeats / 2) + 1)
  })

  it('identifies largest party', () => {
    const result = projectToLGRAuthority(seatTotals, lgrModel)
    expect(result['East Lancashire'].largestParty).toBe('Labour')
  })

  it('computes coalitions for each authority', () => {
    const result = projectToLGRAuthority(seatTotals, lgrModel)
    expect(result['East Lancashire'].coalitions).toBeDefined()
    expect(Array.isArray(result['East Lancashire'].coalitions)).toBe(true)
  })

  it('returns empty for null/missing model', () => {
    expect(projectToLGRAuthority({}, null)).toEqual({})
    expect(projectToLGRAuthority({}, {})).toEqual({})
  })
})
