import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ASSUMPTIONS,
  getBaseline,
  calculateNationalSwing,
  calculateNationalSwingV2,
  calculateDemographicAdjustments,
  calculateDemographicAdjustmentsV2,
  calculateIncumbencyAdjustment,
  calculateReformEntry,
  normaliseShares,
  predictWard,
  predictWardV2,
  predictCouncil,
  predictConstituencyGE,
  predict,
  applyOverrides,
  computeCoalitions,
  projectToLGRAuthority,
  normalizePartyName,
  buildCouncilSeatTotals,
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

  it('produces higher estimate when constituency data is present vs null (bug 1B.2)', () => {
    // Before fix: constituencyMap was null → geReform = 0, only LCC proxy used
    const withoutConstituency = calculateReformEntry(baselineNoReform, null, lcc2025, DEFAULT_ASSUMPTIONS)
    // After fix: constituencyMap populated → geReform = 0.248 (Burnley constituency)
    const burnleyConstituency = { 'Reform UK': 0.248, Labour: 0.502, Conservative: 0.148 }
    const withConstituency = calculateReformEntry(baselineNoReform, burnleyConstituency, lcc2025, DEFAULT_ASSUMPTIONS)

    // Without constituency: (0 × 0.4 + 0.357 × 0.6) × 0.85 = 0.182
    expect(withoutConstituency.reformEstimate).toBeCloseTo(0.182, 2)
    // With constituency: (0.248 × 0.4 + 0.357 × 0.6) × 0.85 = 0.266
    expect(withConstituency.reformEstimate).toBeCloseTo(0.266, 2)
    // Constituency data adds ~8.4 percentage points
    expect(withConstituency.reformEstimate - withoutConstituency.reformEstimate).toBeGreaterThan(0.08)
  })

  it('differentiates wards in different constituencies (Pendle example)', () => {
    // Brierfield wards → Burnley constituency (Reform 24.8%)
    const burnley = { 'Reform UK': 0.248 }
    // Other Pendle wards → Pendle & Clitheroe (Reform 17.5%)
    const pendleClitheroe = { 'Reform UK': 0.175 }

    const brierfield = calculateReformEntry(baselineNoReform, burnley, lcc2025, DEFAULT_ASSUMPTIONS)
    const otherPendle = calculateReformEntry(baselineNoReform, pendleClitheroe, lcc2025, DEFAULT_ASSUMPTIONS)

    // Brierfield should get higher Reform estimate than other Pendle wards
    expect(brierfield.reformEstimate).toBeGreaterThan(otherPendle.reformEstimate)
    // Difference: (0.248 - 0.175) × 0.4 × 0.85 ≈ 2.5pp
    const diff = brierfield.reformEstimate - otherPendle.reformEstimate
    expect(diff).toBeCloseTo(0.0248, 2)
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

// ---------------------------------------------------------------------------
// V2: calculateDemographicAdjustmentsV2
// ---------------------------------------------------------------------------

describe('calculateDemographicAdjustmentsV2', () => {
  const mockCoefficients = {
    Labour: { imd_norm: 0.15, pct_over65: -0.10, pct_young_adults: 0.08, pct_asian: 0.05, pct_white_british: -0.03, pct_unemployed: 0.12 },
    Conservative: { imd_norm: -0.12, pct_over65: 0.14, pct_young_adults: -0.06, pct_asian: -0.04, pct_white_british: 0.05, pct_unemployed: -0.10 },
    'Reform UK': { imd_norm: 0.08, pct_over65: 0.06, pct_white_british: 0.07, pct_unemployed: 0.05 },
  }

  const mockDemographics = {
    age: {
      'Total: All usual residents': 10000,
      'Aged 65 to 74 years': 800,
      'Aged 75 to 84 years': 400,
      'Aged 85 to 89 years': 100,
      'Aged 90 years and over': 50,
      'Aged 20 to 24 years': 600,
      'Aged 25 to 34 years': 1200,
    },
    ethnicity: {
      'Total: All usual residents': 10000,
      'Asian, Asian British or Asian Welsh': 500,
      'White: English, Welsh, Scottish, Northern Irish or British': 8500,
    },
    economic_activity: {
      'Total: All usual residents aged 16 years and over': 8000,
      'Economically active (excluding full-time students): Unemployed': 320,
    },
  }

  const mockDeprivation = { avg_imd_score: 32.0, deprivation_level: 'moderate' }

  it('returns empty adjustments when no coefficients', () => {
    const result = calculateDemographicAdjustmentsV2(mockDemographics, mockDeprivation, null)
    expect(Object.keys(result.adjustments)).toHaveLength(0)
    expect(result.methodology.step).toBe(3)
    expect(result.methodology.name).toBe('Demographics (v2)')
  })

  it('returns empty adjustments when no demographics', () => {
    const result = calculateDemographicAdjustmentsV2(null, mockDeprivation, mockCoefficients)
    expect(Object.keys(result.adjustments)).toHaveLength(0)
    expect(result.methodology.step).toBe(3)
  })

  it('returns empty adjustments when totalPop is 0', () => {
    const emptyDemographics = { age: { 'Total: All usual residents': 0 } }
    const result = calculateDemographicAdjustmentsV2(emptyDemographics, mockDeprivation, mockCoefficients)
    expect(Object.keys(result.adjustments)).toHaveLength(0)
    expect(result.methodology.description).toBe('No population data')
  })

  it('produces adjustments for each party in coefficients', () => {
    const result = calculateDemographicAdjustmentsV2(mockDemographics, mockDeprivation, mockCoefficients)
    expect(result.adjustments).toHaveProperty('Labour')
    expect(result.adjustments).toHaveProperty('Conservative')
    expect(result.adjustments).toHaveProperty('Reform UK')
  })

  it('adjustments are scaled (Math.round(adj * 100) / 10000)', () => {
    const result = calculateDemographicAdjustmentsV2(mockDemographics, mockDeprivation, mockCoefficients)
    // All adjustments should be small numbers (scaled down)
    for (const adj of Object.values(result.adjustments)) {
      expect(Math.abs(adj)).toBeLessThan(0.1)
    }
  })

  it('methodology includes features object', () => {
    const result = calculateDemographicAdjustmentsV2(mockDemographics, mockDeprivation, mockCoefficients)
    expect(result.methodology.features).toBeDefined()
    expect(result.methodology.features.pct_over65).toBeCloseTo(0.135, 2) // (800+400+100+50)/10000
    expect(result.methodology.features.pct_young_adults).toBeCloseTo(0.18, 2) // (600+1200)/10000
    expect(result.methodology.features.pct_asian).toBeCloseTo(0.05, 2) // 500/10000
    expect(result.methodology.features.imd_norm).toBeCloseTo(0.4, 2) // 32/80
  })

  it('uses deprivation avg_imd_score / 80 for imd_norm', () => {
    const highDep = { avg_imd_score: 60.0 }
    const result = calculateDemographicAdjustmentsV2(mockDemographics, highDep, mockCoefficients)
    expect(result.methodology.features.imd_norm).toBeCloseTo(0.75, 2)
  })

  it('defaults imd_norm to 0.5 when no deprivation score', () => {
    const result = calculateDemographicAdjustmentsV2(mockDemographics, null, mockCoefficients)
    expect(result.methodology.features.imd_norm).toBeCloseTo(0.5, 2)
  })

  it('skips non-object coefficient entries', () => {
    const coeffsWithMeta = { ...mockCoefficients, version: '1.0', note: 'test' }
    const result = calculateDemographicAdjustmentsV2(mockDemographics, mockDeprivation, coeffsWithMeta)
    // Should not have 'version' or 'note' as party keys
    expect(result.adjustments).not.toHaveProperty('version')
    expect(result.adjustments).not.toHaveProperty('note')
  })
})

// ---------------------------------------------------------------------------
// V2: calculateNationalSwingV2
// ---------------------------------------------------------------------------

describe('calculateNationalSwingV2', () => {
  const baseline = { Labour: 0.407, Conservative: 0.295, 'Green Party': 0.188, 'Liberal Democrats': 0.110 }
  const dampeningByParty = { Labour: 0.70, Conservative: 0.60, 'Green Party': 0.50, 'Liberal Democrats': 0.55 }

  it('uses per-party dampening from dampeningByParty', () => {
    const result = calculateNationalSwingV2(baseline, nationalPolling, ge2024Result, DEFAULT_ASSUMPTIONS, dampeningByParty)
    // Labour: (0.29 - 0.337) = -0.047, dampened × 0.70 = -0.0329
    expect(result.adjustments.Labour).toBeCloseTo(-0.047 * 0.70, 3)
    // Conservative: (0.24 - 0.237) = 0.003, dampened × 0.60 = 0.0018
    expect(result.adjustments.Conservative).toBeCloseTo(0.003 * 0.60, 3)
  })

  it('falls back to default dampening when party missing from dampeningByParty', () => {
    const partial = { Labour: 0.80 }
    const result = calculateNationalSwingV2(baseline, nationalPolling, ge2024Result, DEFAULT_ASSUMPTIONS, partial)
    // Labour uses 0.80 dampening
    expect(result.adjustments.Labour).toBeCloseTo(-0.047 * 0.80, 3)
    // Conservative falls back to 0.65 (default)
    expect(result.adjustments.Conservative).toBeCloseTo(0.003 * 0.65, 3)
  })

  it('falls back to default dampening when dampeningByParty is null', () => {
    const result = calculateNationalSwingV2(baseline, nationalPolling, ge2024Result, DEFAULT_ASSUMPTIONS, null)
    // All parties use 0.65 default
    expect(result.adjustments.Labour).toBeCloseTo(-0.047 * 0.65, 3)
  })

  it('includes dampening per party in methodology details', () => {
    const result = calculateNationalSwingV2(baseline, nationalPolling, ge2024Result, DEFAULT_ASSUMPTIONS, dampeningByParty)
    expect(result.methodology.details.Labour.dampening).toBe(0.70)
    expect(result.methodology.details.Conservative.dampening).toBe(0.60)
    expect(result.methodology.details['Green Party'].dampening).toBe(0.50)
  })

  it('methodology name is National Swing (v2)', () => {
    const result = calculateNationalSwingV2(baseline, nationalPolling, ge2024Result, DEFAULT_ASSUMPTIONS, dampeningByParty)
    expect(result.methodology.step).toBe(2)
    expect(result.methodology.name).toBe('National Swing (v2)')
  })

  it('respects swing multiplier', () => {
    const doubled = { ...DEFAULT_ASSUMPTIONS, swingMultiplier: 2.0 }
    const normal = calculateNationalSwingV2(baseline, nationalPolling, ge2024Result, DEFAULT_ASSUMPTIONS, dampeningByParty)
    const result = calculateNationalSwingV2(baseline, nationalPolling, ge2024Result, doubled, dampeningByParty)
    expect(Math.abs(result.adjustments.Labour)).toBeCloseTo(Math.abs(normal.adjustments.Labour) * 2, 3)
  })
})

// ---------------------------------------------------------------------------
// V2: predictWardV2
// ---------------------------------------------------------------------------

describe('predictWardV2', () => {
  const lcc2025 = { results: { 'Reform UK': { pct: 0.357 } } }

  const mockModelCoefficients = {
    coefficients: {
      Labour: { imd_norm: 0.10, pct_over65: -0.05 },
      Conservative: { imd_norm: -0.08, pct_over65: 0.06 },
    },
    dampening_by_party: { Labour: 0.70, Conservative: 0.60 },
    validation: {
      Labour: { mae: 0.08 },
      Conservative: { mae: 0.06 },
    },
  }

  it('falls back to V1 when modelCoefficients is null', () => {
    const result = predictWardV2(mockWardHistory, DEFAULT_ASSUMPTIONS, nationalPolling, ge2024Result, null, null, null, lcc2025, null)
    expect(result.prediction).not.toBeNull()
    // V1 does not set modelVersion
    expect(result.modelVersion).toBeUndefined()
  })

  it('falls back to V1 when coefficients key is missing', () => {
    const noCoeffs = { dampening_by_party: { Labour: 0.70 } }
    const result = predictWardV2(mockWardHistory, DEFAULT_ASSUMPTIONS, nationalPolling, ge2024Result, null, null, null, lcc2025, noCoeffs)
    expect(result.modelVersion).toBeUndefined()
  })

  it('returns modelVersion v2 with valid coefficients', () => {
    const result = predictWardV2(mockWardHistory, DEFAULT_ASSUMPTIONS, nationalPolling, ge2024Result, null, null, null, lcc2025, mockModelCoefficients)
    expect(result.modelVersion).toBe('v2')
  })

  it('returns confidenceInterval from validation MAE', () => {
    const result = predictWardV2(mockWardHistory, DEFAULT_ASSUMPTIONS, nationalPolling, ge2024Result, null, null, null, lcc2025, mockModelCoefficients)
    expect(result.confidenceInterval).toBeDefined()
    expect(typeof result.confidenceInterval).toBe('number')
  })

  it('returns none confidence for empty ward', () => {
    const result = predictWardV2({ history: [] }, DEFAULT_ASSUMPTIONS, nationalPolling, ge2024Result, null, null, null, null, mockModelCoefficients)
    expect(result.prediction).toBeNull()
    expect(result.confidence).toBe('none')
  })

  it('predictions sum to approximately 100%', () => {
    const result = predictWardV2(mockWardHistory, DEFAULT_ASSUMPTIONS, nationalPolling, ge2024Result, null, null, null, lcc2025, mockModelCoefficients)
    const totalPct = Object.values(result.prediction).reduce((s, v) => s + v.pct, 0)
    expect(totalPct).toBeCloseTo(1.0, 1)
  })

  it('confidence is high when majorityPct exceeds 2x MAE', () => {
    // With large incumbency bonus and no Reform, Labour should have a wide margin
    const bigIncumbency = { ...DEFAULT_ASSUMPTIONS, incumbencyBonusPct: 0.20, reformStandsInAllWards: false }
    const coeffsWithLowMAE = {
      ...mockModelCoefficients,
      validation: { Labour: { mae: 0.02 }, Conservative: { mae: 0.02 } },
    }
    const result = predictWardV2(mockWardHistory, bigIncumbency, nationalPolling, ge2024Result, null, null, null, null, coeffsWithLowMAE)
    if (result.majorityPct > 0.04) {
      expect(result.confidence).toBe('high')
    }
  })
})

// ---------------------------------------------------------------------------
// V2: predictConstituencyGE
// ---------------------------------------------------------------------------

describe('predictConstituencyGE', () => {
  const mockConstituency = {
    name: 'Burnley',
    ge2024: {
      results: [
        { party: 'Labour', pct: 0.40 },
        { party: 'Reform UK', pct: 0.25 },
        { party: 'Conservative', pct: 0.20 },
        { party: 'Liberal Democrats', pct: 0.10 },
        { party: 'Green Party', pct: 0.05 },
      ],
    },
    mp: { name: 'Oliver Ryan', party: 'Labour' },
  }

  const mockPolling = {
    aggregate: { Labour: 0.29, Conservative: 0.24, 'Reform UK': 0.22, 'Liberal Democrats': 0.12, 'Green Party': 0.07 },
    ge2024_baseline: { Labour: 0.337, Conservative: 0.237, 'Reform UK': 0.143, 'Liberal Democrats': 0.122, 'Green Party': 0.069 },
  }

  const mockModelCoeffs = {
    dampening_by_party: { Labour: 0.70, Conservative: 0.60, 'Reform UK': 0.75, 'Liberal Democrats': 0.55, 'Green Party': 0.50 },
  }

  it('returns null prediction when no constituency ge2024 results', () => {
    const result = predictConstituencyGE({}, mockPolling, mockModelCoeffs)
    expect(result.prediction).toBeNull()
    expect(result.confidence).toBe('none')
  })

  it('returns null prediction when no polling aggregate', () => {
    const result = predictConstituencyGE(mockConstituency, {}, mockModelCoeffs)
    expect(result.prediction).toBeNull()
  })

  it('returns null prediction for null inputs', () => {
    const result = predictConstituencyGE(null, null, null)
    expect(result.prediction).toBeNull()
    expect(result.confidence).toBe('none')
  })

  it('produces a winner and runnerUp', () => {
    const result = predictConstituencyGE(mockConstituency, mockPolling, mockModelCoeffs)
    expect(result.winner).toBeDefined()
    expect(result.runnerUp).toBeDefined()
    expect(result.majorityPct).toBeGreaterThanOrEqual(0)
  })

  it('prediction party shares sum to approximately 100%', () => {
    const result = predictConstituencyGE(mockConstituency, mockPolling, mockModelCoeffs)
    const total = Object.values(result.prediction).reduce((s, v) => s + v.pct, 0)
    expect(total).toBeCloseTo(1.0, 1)
  })

  it('applies dampening * 1.2 (capped at 0.95) for GE', () => {
    const result = predictConstituencyGE(mockConstituency, mockPolling, mockModelCoeffs)
    // Labour dampening: min(0.95, 0.70 * 1.2) = min(0.95, 0.84) = 0.84
    const labourDetail = result.methodology[1].details.Labour
    expect(labourDetail.dampening).toBeCloseTo(0.84, 2)
    // Reform UK dampening: min(0.95, 0.75 * 1.2) = min(0.95, 0.90) = 0.90
    const reformDetail = result.methodology[1].details['Reform UK']
    expect(reformDetail.dampening).toBeCloseTo(0.90, 2)
  })

  it('caps dampening at 0.95', () => {
    const highDampening = { dampening_by_party: { Labour: 0.85 } }
    const result = predictConstituencyGE(mockConstituency, mockPolling, highDampening)
    // Labour: min(0.95, 0.85 * 1.2) = min(0.95, 1.02) = 0.95
    const labourDetail = result.methodology[1].details.Labour
    expect(labourDetail.dampening).toBe(0.95)
  })

  it('includes swing vs GE2024', () => {
    const result = predictConstituencyGE(mockConstituency, mockPolling, mockModelCoeffs)
    expect(result.swing).toBeDefined()
    expect(typeof result.swing.Labour).toBe('number')
  })

  it('detects mpChange when winner differs from current MP', () => {
    const reformWin = {
      ...mockConstituency,
      ge2024: {
        results: [
          { party: 'Reform UK', pct: 0.55 },
          { party: 'Labour', pct: 0.25 },
          { party: 'Conservative', pct: 0.20 },
        ],
      },
      mp: { name: 'Oliver Ryan', party: 'Labour' },
    }
    const result = predictConstituencyGE(reformWin, mockPolling, mockModelCoeffs)
    if (result.winner !== 'Labour') {
      expect(result.mpChange).toBe(true)
    }
  })

  it('mpChange is false when winner matches MP party', () => {
    const result = predictConstituencyGE(mockConstituency, mockPolling, mockModelCoeffs)
    if (result.winner === 'Labour') {
      expect(result.mpChange).toBe(false)
    }
  })

  it('strips (Co-op) from MP party for mpChange comparison', () => {
    const coopMP = {
      ...mockConstituency,
      mp: { name: 'Test MP', party: 'Labour (Co-op)' },
    }
    const result = predictConstituencyGE(coopMP, mockPolling, mockModelCoeffs)
    // Labour (Co-op) stripped to Labour — should match Labour winner
    if (result.winner === 'Labour') {
      expect(result.mpChange).toBe(false)
    }
  })

  it('has methodology steps 1-3', () => {
    const result = predictConstituencyGE(mockConstituency, mockPolling, mockModelCoeffs)
    expect(result.methodology).toHaveLength(3)
    expect(result.methodology.map(m => m.step)).toEqual([1, 2, 3])
  })

  it('has confidence level', () => {
    const result = predictConstituencyGE(mockConstituency, mockPolling, mockModelCoeffs)
    expect(['high', 'medium', 'low']).toContain(result.confidence)
  })
})

// ---------------------------------------------------------------------------
// V2: predict (universal router)
// ---------------------------------------------------------------------------

describe('predict', () => {
  const lcc2025 = { results: { 'Reform UK': { pct: 0.357 } } }
  const mockPolling = {
    aggregate: nationalPolling,
    ge2024_baseline: ge2024Result,
  }

  const mockModelCoeffs = {
    coefficients: {
      Labour: { imd_norm: 0.10 },
      Conservative: { imd_norm: -0.08 },
    },
    dampening_by_party: { Labour: 0.70, Conservative: 0.60 },
    validation: { Labour: { mae: 0.08 } },
  }

  it('routes to predictWardV2 for scope ward', () => {
    const result = predict(
      { scope: 'ward' },
      { wardData: mockWardHistory, lcc2025 },
      mockPolling,
      mockModelCoeffs,
    )
    expect(result.prediction).not.toBeNull()
    expect(result.modelVersion).toBe('v2')
  })

  it('routes to predictCouncil for scope council', () => {
    const mockElectionsData = {
      wards: {
        'Ward A': { ...mockWardHistory },
      },
    }
    const result = predict(
      { scope: 'council' },
      { electionsData: mockElectionsData, wardsUp: ['Ward A'] },
      mockPolling,
      mockModelCoeffs,
    )
    expect(result.wards).toBeDefined()
    expect(result.seatTotals).toBeDefined()
  })

  it('routes to predictConstituencyGE for scope constituency', () => {
    const constituency = {
      name: 'Burnley',
      ge2024: {
        results: [
          { party: 'Labour', pct: 0.40 },
          { party: 'Conservative', pct: 0.30 },
          { party: 'Reform UK', pct: 0.20 },
          { party: 'Liberal Democrats', pct: 0.10 },
        ],
      },
      mp: { name: 'Oliver Ryan', party: 'Labour' },
    }
    const result = predict(
      { scope: 'constituency' },
      { constituency },
      mockPolling,
      mockModelCoeffs,
    )
    expect(result.winner).toBeDefined()
    expect(result.swing).toBeDefined()
  })

  it('returns null prediction for unknown scope', () => {
    const result = predict({ scope: 'galaxy' }, {}, mockPolling, mockModelCoeffs)
    expect(result.prediction).toBeNull()
    expect(result.confidence).toBe('none')
  })

  it('returns null prediction for null election', () => {
    const result = predict(null, {}, mockPolling, mockModelCoeffs)
    expect(result.prediction).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// normalizePartyName
// ---------------------------------------------------------------------------

describe('normalizePartyName', () => {
  it('returns Unknown for null/undefined/empty', () => {
    expect(normalizePartyName(null)).toBe('Unknown')
    expect(normalizePartyName(undefined)).toBe('Unknown')
    expect(normalizePartyName('')).toBe('Unknown')
  })

  it('normalizes Labour & Co-operative variants to Labour', () => {
    expect(normalizePartyName('Labour & Co-operative')).toBe('Labour')
    expect(normalizePartyName('Labour & Co-operative Party')).toBe('Labour')
    expect(normalizePartyName('Labour and Co-operative')).toBe('Labour')
    expect(normalizePartyName('Labour & Coop')).toBe('Labour')
    expect(normalizePartyName('Labour Group')).toBe('Labour')
  })

  it('passes through plain Labour', () => {
    expect(normalizePartyName('Labour')).toBe('Labour')
  })

  it('normalizes Liberal Democrat variants', () => {
    expect(normalizePartyName('Liberal Democrats')).toBe('Liberal Democrats')
    expect(normalizePartyName('Lib Dem')).toBe('Liberal Democrats')
    expect(normalizePartyName('Lib Dems')).toBe('Liberal Democrats')
    expect(normalizePartyName('Liberal Democrat')).toBe('Liberal Democrats')
  })

  it('normalizes Conservative variants', () => {
    expect(normalizePartyName('Conservative')).toBe('Conservative')
    expect(normalizePartyName('The Conservative Party')).toBe('Conservative')
    expect(normalizePartyName('Conservative Group')).toBe('Conservative')
  })

  it('normalizes Green variants', () => {
    expect(normalizePartyName('Green Party')).toBe('Green Party')
    expect(normalizePartyName('Green')).toBe('Green Party')
    expect(normalizePartyName('Greens')).toBe('Green Party')
  })

  it('normalizes Reform variants', () => {
    expect(normalizePartyName('Reform UK')).toBe('Reform UK')
    expect(normalizePartyName('Reform')).toBe('Reform UK')
  })

  it('normalizes local independent groups to Independent', () => {
    expect(normalizePartyName('Independent')).toBe('Independent')
    expect(normalizePartyName('Our West Lancashire')).toBe('Independent')
    expect(normalizePartyName('4 BwD')).toBe('Independent')
    expect(normalizePartyName('Morecambe Bay Independents')).toBe('Independent')
    expect(normalizePartyName('Wyre Independent Group')).toBe('Independent')
    expect(normalizePartyName('Ashton Independent')).toBe('Independent')
    expect(normalizePartyName("Pendle's True Independents")).toBe('Independent')
  })

  it('passes through unknown parties unchanged', () => {
    expect(normalizePartyName('UKIP')).toBe('UKIP')
    expect(normalizePartyName('Plaid Cymru')).toBe('Plaid Cymru')
    expect(normalizePartyName('Your Party')).toBe('Your Party')
  })

  it('trims whitespace', () => {
    expect(normalizePartyName('  Labour  ')).toBe('Labour')
    expect(normalizePartyName(' Reform UK ')).toBe('Reform UK')
  })
})

// ---------------------------------------------------------------------------
// buildCouncilSeatTotals
// ---------------------------------------------------------------------------

describe('buildCouncilSeatTotals', () => {
  const mockSummaries = {
    burnley: {
      total_councillors: 45,
      by_party: [
        { party: 'Labour', count: 23 },
        { party: 'Independent', count: 12 },
        { party: 'Liberal Democrats', count: 10 },
      ],
    },
    west_lancashire: {
      total_councillors: 45,
      by_party: [
        { party: 'Labour & Co-operative', count: 16 },
        { party: 'Conservative', count: 14 },
        { party: 'Our West Lancashire', count: 7 },
        { party: 'Labour', count: 5 },
        { party: 'Independent', count: 2 },
        { party: 'Your Party', count: 1 },
      ],
    },
  }

  it('builds seat totals per council', () => {
    const result = buildCouncilSeatTotals(mockSummaries)
    expect(result.burnley).toEqual({
      Labour: 23,
      Independent: 12,
      'Liberal Democrats': 10,
    })
  })

  it('normalizes party names by default', () => {
    const result = buildCouncilSeatTotals(mockSummaries)
    // Labour & Co-operative (16) + Labour (5) = 21 Labour
    expect(result.west_lancashire.Labour).toBe(21)
    // Our West Lancashire → Independent (7) + Independent (2) = 9
    expect(result.west_lancashire.Independent).toBe(9)
    expect(result.west_lancashire['Our West Lancashire']).toBeUndefined()
    expect(result.west_lancashire['Labour & Co-operative']).toBeUndefined()
  })

  it('skips normalization when normalize=false', () => {
    const result = buildCouncilSeatTotals(mockSummaries, false)
    expect(result.west_lancashire['Labour & Co-operative']).toBe(16)
    expect(result.west_lancashire.Labour).toBe(5)
    expect(result.west_lancashire['Our West Lancashire']).toBe(7)
  })

  it('skips councils without by_party', () => {
    const partial = {
      burnley: mockSummaries.burnley,
      unknown: { total_councillors: 10 }, // no by_party
    }
    const result = buildCouncilSeatTotals(partial)
    expect(result.burnley).toBeDefined()
    expect(result.unknown).toBeUndefined()
  })

  it('handles empty input', () => {
    expect(buildCouncilSeatTotals({})).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// projectToLGRAuthority with normalization
// ---------------------------------------------------------------------------

describe('projectToLGRAuthority with normalization', () => {
  const lgrModel = {
    authorities: [
      { name: 'East Lancashire', councils: ['burnley', 'hyndburn', 'pendle', 'rossendale'] },
    ],
  }

  it('normalizes party names when aggregating across councils', () => {
    const seatTotals = {
      burnley: { Labour: 23, Independent: 12 },
      hyndburn: { Labour: 15, 'Labour & Co-operative': 6, Conservative: 13 },
      pendle: { Conservative: 21, Labour: 15 },
      rossendale: { Labour: 18, 'Green Party': 6 },
    }
    const result = projectToLGRAuthority(seatTotals, lgrModel)
    const east = result['East Lancashire']
    // Labour (23+15+15+18) + Labour & Co-op normalized (6) = 77
    expect(east.seats.Labour).toBe(77)
    // Labour & Co-operative should not appear separately
    expect(east.seats['Labour & Co-operative']).toBeUndefined()
  })

  it('includes perCouncil in output', () => {
    const seatTotals = {
      burnley: { Labour: 23 },
      hyndburn: { Labour: 21 },
      pendle: { Conservative: 21 },
      rossendale: { Labour: 18 },
    }
    const result = projectToLGRAuthority(seatTotals, lgrModel)
    const east = result['East Lancashire']
    expect(east.perCouncil).toBeDefined()
    expect(east.perCouncil.burnley).toEqual({ Labour: 23 })
    expect(east.perCouncil.pendle).toEqual({ Conservative: 21 })
  })

  it('handles mixed Independent groups correctly', () => {
    const seatTotals = {
      burnley: { Independent: 5 },
      hyndburn: { 'Wyre Independent Group': 3 },
      pendle: { '4 BwD': 2 },
      rossendale: { 'Our West Lancashire': 4 },
    }
    const result = projectToLGRAuthority(seatTotals, lgrModel)
    const east = result['East Lancashire']
    // All should be merged into Independent: 5+3+2+4 = 14
    expect(east.seats.Independent).toBe(14)
  })
})
