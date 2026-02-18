import { describe, it, expect } from 'vitest'
import { computeCashflow, computeSensitivity, computeTornado, findBreakevenYear,
         DEFAULT_ASSUMPTIONS, MODEL_KEY_MAP } from './lgrModel'

const mockParams = {
  annualSavings: 126000000,
  transitionCosts: { it: 30000000, redundancy: 20000000, programme: 8100000, legal: 4000000 },
  costProfile: {
    it: { year_minus_1: 0.1, year_1: 0.4, year_2: 0.35, year_3: 0.15 },
    redundancy: { year_1: 0.6, year_2: 0.4 },
    programme: { year_minus_1: 0.15, year_1: 0.3, year_2: 0.3, year_3: 0.2, year_4: 0.05 },
    legal: { year_minus_1: 0.2, year_1: 0.5, year_2: 0.3 },
  },
  savingsRamp: [0, 0.10, 0.25, 0.50, 0.75, 0.90, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  assumptions: DEFAULT_ASSUMPTIONS,
}

describe('lgrModel', () => {
  describe('computeCashflow', () => {
    it('returns 12 year entries (Y-1 through Y11)', () => {
      const result = computeCashflow(mockParams)
      expect(result).toHaveLength(12)
      expect(result[0].year).toBe('Y-1')
      expect(result[11].year).toBe('Y11')
    })

    it('Y-1 has costs but zero savings', () => {
      const result = computeCashflow(mockParams)
      expect(result[0].savings).toBe(0)
      expect(result[0].costs).toBeLessThan(0)
    })

    it('cumulative turns positive eventually', () => {
      const result = computeCashflow(mockParams)
      const lastYear = result[result.length - 1]
      expect(lastYear.cumulative).toBeGreaterThan(0)
    })

    it('NPV is less than nominal cumulative (positive discount rate)', () => {
      const result = computeCashflow(mockParams)
      const lastYear = result[result.length - 1]
      expect(lastYear.npv).toBeLessThan(lastYear.cumulative)
    })

    it('each year has required fields', () => {
      const result = computeCashflow(mockParams)
      for (const year of result) {
        expect(year).toHaveProperty('year')
        expect(year).toHaveProperty('yearNum')
        expect(year).toHaveProperty('costs')
        expect(year).toHaveProperty('savings')
        expect(year).toHaveProperty('net')
        expect(year).toHaveProperty('cumulative')
        expect(year).toHaveProperty('npv')
        expect(year).toHaveProperty('discountFactor')
      }
    })
  })

  describe('computeSensitivity', () => {
    it('returns best, central, worst scenarios', () => {
      const result = computeSensitivity(mockParams)
      expect(result.best).toBeDefined()
      expect(result.central).toBeDefined()
      expect(result.worst).toBeDefined()
    })

    it('best NPV > central NPV > worst NPV', () => {
      const result = computeSensitivity(mockParams)
      const bestNPV = result.best[11].npv
      const centralNPV = result.central[11].npv
      const worstNPV = result.worst[11].npv
      expect(bestNPV).toBeGreaterThan(centralNPV)
      expect(centralNPV).toBeGreaterThan(worstNPV)
    })

    it('each scenario has 12 entries', () => {
      const result = computeSensitivity(mockParams)
      expect(result.best).toHaveLength(12)
      expect(result.central).toHaveLength(12)
      expect(result.worst).toHaveLength(12)
    })
  })

  describe('computeTornado', () => {
    it('returns sorted results with impact values', () => {
      const result = computeTornado(mockParams)
      expect(result.length).toBeGreaterThan(0)
      // Should be sorted by impact descending
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].impact).toBeGreaterThanOrEqual(result[i].impact)
      }
    })

    it('each entry has required fields', () => {
      const result = computeTornado(mockParams)
      for (const entry of result) {
        expect(entry).toHaveProperty('label')
        expect(entry).toHaveProperty('key')
        expect(entry).toHaveProperty('lowNPV')
        expect(entry).toHaveProperty('highNPV')
        expect(entry).toHaveProperty('baseNPV')
        expect(entry).toHaveProperty('impact')
      }
    })
  })

  describe('findBreakevenYear', () => {
    it('returns the first year where cumulative > 0', () => {
      const cashflow = computeCashflow(mockParams)
      const breakeven = findBreakevenYear(cashflow)
      expect(breakeven).toBeTruthy()
      // With these params, should break even within first few years
      expect(['Y1', 'Y2', 'Y3', 'Y4', 'Y5']).toContain(breakeven)
    })
  })

  describe('MODEL_KEY_MAP', () => {
    it('maps all 5 model IDs', () => {
      expect(Object.keys(MODEL_KEY_MAP)).toHaveLength(5)
      expect(MODEL_KEY_MAP.two_unitary).toBe('two_ua')
      expect(MODEL_KEY_MAP.county_unitary).toBe('county')
    })
  })
})
