import { describe, it, expect } from 'vitest'
import {
  CPI_H_INDEX, deflate, realGrowthRate, perCapita, zScore,
  computeDistributionStats, giniCoefficient, reservesAdequacy,
  benfordSecondDigit, peerBenchmark, normalizeFinancialYear,
} from './analytics'

describe('CPI_H_INDEX', () => {
  it('contains all financial years from 2015/16 to 2025/26', () => {
    expect(Object.keys(CPI_H_INDEX)).toHaveLength(11)
    expect(CPI_H_INDEX['2015/16']).toBeDefined()
    expect(CPI_H_INDEX['2025/26']).toBeDefined()
  })

  it('values increase over time (inflation)', () => {
    const values = Object.values(CPI_H_INDEX)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1])
    }
  })
})

describe('deflate', () => {
  it('deflates nominal to real terms', () => {
    // £100 in 2015/16 should be worth more in 2024/25 terms
    const real = deflate(100, '2015/16', '2024/25')
    expect(real).toBeGreaterThan(100)
    expect(real).toBeCloseTo(100 * (136.0 / 100.6), 1)
  })

  it('inflates when going from newer to older year', () => {
    const real = deflate(100, '2024/25', '2015/16')
    expect(real).toBeLessThan(100)
  })

  it('returns same value when fromYear === toYear', () => {
    const real = deflate(100, '2022/23', '2022/23')
    expect(real).toBe(100)
  })

  it('returns null for unknown years', () => {
    expect(deflate(100, '2010/11', '2024/25')).toBeNull()
    expect(deflate(100, '2024/25', '2030/31')).toBeNull()
  })

  it('returns null for null/NaN input', () => {
    expect(deflate(null, '2022/23', '2024/25')).toBeNull()
    expect(deflate(NaN, '2022/23', '2024/25')).toBeNull()
  })
})

describe('realGrowthRate', () => {
  it('computes nominal and real growth rates', () => {
    const amounts = [1000, 1100, 1200]
    const years = ['2021/22', '2022/23', '2023/24']
    const result = realGrowthRate(amounts, years)

    expect(result).toHaveLength(3)
    expect(result[0].nominalGrowth).toBeNull() // No previous year
    expect(result[1].nominalGrowth).toBeCloseTo(10.0, 1)
    expect(result[2].nominalGrowth).toBeCloseTo(9.09, 1)
    // Real growth should be lower than nominal (positive inflation)
    expect(result[2].realGrowth).toBeLessThan(result[2].nominalGrowth)
  })

  it('returns empty array for mismatched inputs', () => {
    expect(realGrowthRate([100], ['2021/22', '2022/23'])).toEqual([])
    expect(realGrowthRate(null, null)).toEqual([])
  })
})

describe('perCapita', () => {
  it('computes per-capita amount', () => {
    expect(perCapita(1000000, 50000)).toBe(20)
  })

  it('returns null for zero or negative population', () => {
    expect(perCapita(1000000, 0)).toBeNull()
    expect(perCapita(1000000, -1)).toBeNull()
  })

  it('returns null for null inputs', () => {
    expect(perCapita(null, 50000)).toBeNull()
    expect(perCapita(1000000, null)).toBeNull()
  })
})

describe('zScore', () => {
  it('computes standard z-score', () => {
    expect(zScore(120, 100, 10)).toBe(2.0)
    expect(zScore(80, 100, 10)).toBe(-2.0)
    expect(zScore(100, 100, 10)).toBe(0)
  })

  it('returns null when stdDev is 0', () => {
    expect(zScore(100, 100, 0)).toBeNull()
  })

  it('returns null for null inputs', () => {
    expect(zScore(null, 100, 10)).toBeNull()
    expect(zScore(100, null, 10)).toBeNull()
  })
})

describe('computeDistributionStats', () => {
  it('computes stats for a simple dataset', () => {
    const data = [10, 20, 30, 40, 50]
    const stats = computeDistributionStats(data)

    expect(stats.mean).toBe(30)
    expect(stats.median).toBe(30)
    expect(stats.count).toBe(5)
    expect(stats.min).toBe(10)
    expect(stats.max).toBe(50)
    expect(stats.stdDev).toBeGreaterThan(0)
    expect(stats.p25).toBe(20)
    expect(stats.p75).toBe(40)
    expect(stats.iqr).toBe(20)
  })

  it('computes correct std dev for known dataset', () => {
    // Values: [2, 4, 4, 4, 5, 5, 7, 9] → mean=5, sample stddev=2.138
    const data = [2, 4, 4, 4, 5, 5, 7, 9]
    const stats = computeDistributionStats(data)
    expect(stats.mean).toBe(5)
    expect(stats.stdDev).toBeCloseTo(2.138, 2)
  })

  it('returns zeros for empty array', () => {
    const stats = computeDistributionStats([])
    expect(stats.mean).toBe(0)
    expect(stats.median).toBe(0)
    expect(stats.stdDev).toBe(0)
    expect(stats.count).toBe(0)
  })

  it('handles single value', () => {
    const stats = computeDistributionStats([42])
    expect(stats.mean).toBe(42)
    expect(stats.median).toBe(42)
    expect(stats.stdDev).toBe(0)
    expect(stats.count).toBe(1)
    expect(stats.skewness).toBeNull()
  })

  it('computes skewness for right-skewed data', () => {
    const data = [1, 1, 2, 2, 3, 5, 10, 20, 50]
    const stats = computeDistributionStats(data)
    expect(stats.skewness).toBeGreaterThan(0) // Right-skewed
  })

  it('computes percentiles correctly', () => {
    // 100 evenly spaced values: 1 to 100
    const data = Array.from({ length: 100 }, (_, i) => i + 1)
    const stats = computeDistributionStats(data)
    expect(stats.p10).toBeCloseTo(10.9, 0)
    expect(stats.p25).toBeCloseTo(25.75, 0)
    expect(stats.p75).toBeCloseTo(75.25, 0)
    expect(stats.p90).toBeCloseTo(90.1, 0)
  })
})

describe('giniCoefficient', () => {
  it('returns 0 for perfectly equal distribution', () => {
    expect(giniCoefficient([100, 100, 100, 100])).toBeCloseTo(0, 5)
  })

  it('returns close to 1 for extreme inequality', () => {
    const values = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1000000]
    const gini = giniCoefficient(values)
    expect(gini).toBeGreaterThan(0.8)
  })

  it('returns moderate value for mixed distribution', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    const gini = giniCoefficient(values)
    expect(gini).toBeGreaterThan(0.1)
    expect(gini).toBeLessThan(0.5)
  })

  it('returns 0 for single value or empty array', () => {
    expect(giniCoefficient([100])).toBe(0)
    expect(giniCoefficient([])).toBe(0)
    expect(giniCoefficient(null)).toBe(0)
  })

  it('filters out zero and negative values', () => {
    expect(giniCoefficient([0, 0, 100, 100])).toBeCloseTo(0, 5)
  })
})

describe('reservesAdequacy', () => {
  it('rates critical when < 3 months cover', () => {
    const result = reservesAdequacy(1000000, 5000000) // 2.4 months
    expect(result.monthsCover).toBeCloseTo(2.4, 1)
    expect(result.rating).toBe('Critical')
    expect(result.color).toBe('#dc3545')
  })

  it('rates low when 3-6 months cover', () => {
    const result = reservesAdequacy(2000000, 5000000) // 4.8 months
    expect(result.monthsCover).toBeCloseTo(4.8, 1)
    expect(result.rating).toBe('Low')
  })

  it('rates adequate when 6-12 months cover', () => {
    const result = reservesAdequacy(4000000, 5000000) // 9.6 months
    expect(result.rating).toBe('Adequate')
    expect(result.color).toBe('#28a745')
  })

  it('rates strong when > 12 months cover', () => {
    const result = reservesAdequacy(6000000, 5000000) // 14.4 months
    expect(result.rating).toBe('Strong')
    expect(result.color).toBe('#007bff')
  })

  it('returns null for invalid inputs', () => {
    expect(reservesAdequacy(null, 5000000)).toBeNull()
    expect(reservesAdequacy(1000000, 0)).toBeNull()
    expect(reservesAdequacy(1000000, -1)).toBeNull()
  })
})

describe('benfordSecondDigit', () => {
  it('returns null for fewer than 50 qualifying amounts', () => {
    const amounts = Array.from({ length: 30 }, (_, i) => (i + 1) * 100)
    expect(benfordSecondDigit(amounts)).toBeNull()
  })

  it('computes chi-squared for sufficient sample', () => {
    // Generate 1000 random amounts to get a result
    const amounts = Array.from({ length: 1000 }, () => Math.random() * 10000 + 10)
    const result = benfordSecondDigit(amounts)

    expect(result).not.toBeNull()
    expect(result.observed).toHaveLength(10)
    expect(result.expected).toHaveLength(10)
    expect(result.df).toBe(9)
    expect(result.n).toBeGreaterThan(0)
    expect(result.chiSquared).toBeGreaterThanOrEqual(0)
    expect(typeof result.significant).toBe('boolean')
    expect(result.pDescription).toBeDefined()
  })

  it('filters out amounts ≤ 9', () => {
    const amounts = [1, 2, 3, 5, 8, ...Array.from({ length: 100 }, () => 1234)]
    const result = benfordSecondDigit(amounts)
    // Small amounts should be excluded from n
    expect(result.n).toBe(100)
  })

  it('detects anomalous distribution as significant', () => {
    // All second digits are 0 — highly anomalous
    const amounts = Array.from({ length: 500 }, () => 10) // second digit always 0
    const result = benfordSecondDigit(amounts)
    expect(result.significant).toBe(true)
  })
})

describe('peerBenchmark', () => {
  it('ranks correctly among peers', () => {
    const result = peerBenchmark(30, [10, 20, 30, 40, 50])
    expect(result.rank).toBe(3)
    expect(result.total).toBe(5)
    expect(result.percentile).toBe(60)
    expect(result.median).toBe(30)
  })

  it('rates low percentile as Low (good for spending)', () => {
    const result = peerBenchmark(10, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    expect(result.rating).toBe('Low')
    expect(result.color).toBe('#28a745')
  })

  it('rates high percentile as High', () => {
    const result = peerBenchmark(90, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    expect(result.rating).toBe('High')
    expect(result.color).toBe('#dc3545')
  })

  it('handles empty peer values', () => {
    const result = peerBenchmark(50, [])
    expect(result.rank).toBe(0)
    expect(result.rating).toBe('N/A')
  })

  it('handles null value', () => {
    const result = peerBenchmark(null, [10, 20, 30])
    expect(result.rating).toBe('N/A')
  })
})

describe('normalizeFinancialYear', () => {
  it('converts dash to slash format', () => {
    expect(normalizeFinancialYear('2021-22', 'slash')).toBe('2021/22')
  })

  it('converts slash to dash format', () => {
    expect(normalizeFinancialYear('2021/22', 'dash')).toBe('2021-22')
  })

  it('preserves correct format', () => {
    expect(normalizeFinancialYear('2021/22', 'slash')).toBe('2021/22')
    expect(normalizeFinancialYear('2021-22', 'dash')).toBe('2021-22')
  })

  it('handles null/undefined', () => {
    expect(normalizeFinancialYear(null)).toBeNull()
    expect(normalizeFinancialYear(undefined)).toBeUndefined()
  })
})
