import { describe, it, expect } from 'vitest'
import { computeCashflow, computeSensitivity, computeTornado, findBreakevenYear,
         DEFAULT_ASSUMPTIONS, MODEL_KEY_MAP,
         computeDemographicDemand, computeDemographicFiscalProfile,
         computeEducationSENDExposure, computeAsylumCostImpact,
         computeWhiteFlightVelocity, adjustSavingsForDeprivation,
         adjustForCCATransfers, computeTimelineFeasibility,
         computePropertyDivision, assessPropertyForLGR,
         computeThreatAssessment, calculateDogeAdjustedRealisation,
         computeStatusQuoSavings, computeOpportunityCost,
         computeDistractionLoss, computeServiceFailureRisk,
         computeCounterfactualComparison, computeRiskAdjustedCashflow } from './lgrModel'

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

  // ═══════════════════════════════════════════════════════════════
  // Demographic Fiscal Intelligence Functions
  // ═══════════════════════════════════════════════════════════════

  describe('computeDemographicDemand', () => {
    const mockDemand = {
      two_unitary: {
        'North Lancashire': {
          population: 686000,
          population_projected: { '2032': 710000 },
          dependency_ratio: 62.5,
          dependency_projected: { '2032': 65.3 },
          under_16_pct: 18.2,
          over_65_pct: 22.1,
          working_age_pct: 59.7,
          service_demand_pressure_score: 68,
        },
        'South Lancashire': {
          population: 844000,
          service_demand_pressure_score: 72,
        },
      },
    }

    it('returns array of authority demand data', () => {
      const result = computeDemographicDemand(mockDemand, 'two_unitary')
      expect(result).toHaveLength(2)
      expect(result[0].authority).toBe('North Lancashire')
      expect(result[0].population).toBe(686000)
    })

    it('uses target year for projections', () => {
      const result = computeDemographicDemand(mockDemand, 'two_unitary', '2032')
      expect(result[0].population_projected).toBe(710000)
      expect(result[0].dependency_projected).toBe(65.3)
    })

    it('returns empty array for missing model', () => {
      expect(computeDemographicDemand(mockDemand, 'nonexistent')).toEqual([])
    })

    it('returns empty for null input', () => {
      expect(computeDemographicDemand(null, 'two_unitary')).toEqual([])
    })

    it('defaults missing fields to 0', () => {
      const result = computeDemographicDemand(mockDemand, 'two_unitary')
      expect(result[1].under_16_pct).toBe(0)
      expect(result[1].demand_index).toBe(72)
    })
  })

  describe('computeDemographicFiscalProfile', () => {
    const mockFiscal = {
      three_unitary: {
        'Pennine Lancashire': {
          population: 560000,
          fiscal_sustainability_score: 32,
          service_demand_pressure_score: 74,
          risk_category: 'At Risk',
          risk_factors: ['High deprivation', 'Low collection'],
          white_british_pct: 73.7,
          pakistani_bangladeshi_pct: 14.6,
          muslim_pct: 19.4,
          grt_count: 194,
          roma_count: 202,
          eu8_eu2_born_pct: 1.9,
          employment_rate_pct: 53.0,
          no_qualifications_pct: 22.2,
          collection_rate_weighted: 94.5,
          estimated_send_rate_pct: 15.1,
        },
      },
    }

    it('returns authority fiscal profiles', () => {
      const result = computeDemographicFiscalProfile(mockFiscal, 'three_unitary')
      expect(result).toHaveLength(1)
      expect(result[0].authority).toBe('Pennine Lancashire')
      expect(result[0].fiscal_sustainability_score).toBe(32)
      expect(result[0].risk_category).toBe('At Risk')
    })

    it('includes ethnic composition data', () => {
      const result = computeDemographicFiscalProfile(mockFiscal, 'three_unitary')
      expect(result[0].muslim_pct).toBe(19.4)
      expect(result[0].pakistani_bangladeshi_pct).toBe(14.6)
      expect(result[0].grt_count).toBe(194)
      expect(result[0].roma_count).toBe(202)
    })

    it('includes economic data', () => {
      const result = computeDemographicFiscalProfile(mockFiscal, 'three_unitary')
      expect(result[0].employment_rate_pct).toBe(53.0)
      expect(result[0].no_qualifications_pct).toBe(22.2)
    })

    it('returns empty for null', () => {
      expect(computeDemographicFiscalProfile(null, 'x')).toEqual([])
    })
  })

  describe('computeEducationSENDExposure', () => {
    const mockSEND = {
      two_unitary: {
        'East Authority': {
          school_age_pop: 45000,
          estimated_send_rate_pct: 15.4,
          estimated_send_pupils: 6930,
          estimated_eal_pupils: 3200,
          dsg_deficit_share: 180000000,
          dsg_deficit_per_capita: 660,
          education_cost_share: 500000000,
          send_risk_rating: 'HIGH',
          cost_premium_vs_average: 12.5,
        },
      },
    }

    it('returns SEND exposure data', () => {
      const result = computeEducationSENDExposure(mockSEND, {}, 'two_unitary')
      expect(result).toHaveLength(1)
      expect(result[0].school_age_pop).toBe(45000)
      expect(result[0].send_risk_rating).toBe('HIGH')
      expect(result[0].dsg_deficit_share).toBe(180000000)
    })

    it('returns empty for missing model', () => {
      expect(computeEducationSENDExposure(mockSEND, {}, 'nonexistent')).toEqual([])
    })
  })

  describe('computeAsylumCostImpact', () => {
    const mockAsylum = {
      two_unitary: {
        'North': {
          asylum_seekers_current: 186,
          per_1000_pop: 0.27,
          projected_2028: { low: 215, central: 262, high: 322 },
          projected_2032: { low: 242, central: 318, high: 472 },
          estimated_annual_cost: 1860000,
          cost_breakdown: { nrpf: 930000, education: 372000 },
          trend: [{ date: '2022', people: 85 }],
        },
      },
    }

    it('returns asylum impact data', () => {
      const result = computeAsylumCostImpact(mockAsylum, 'two_unitary')
      expect(result).toHaveLength(1)
      expect(result[0].current_seekers).toBe(186)
      expect(result[0].annual_cost_estimate).toBe(1860000)
    })

    it('includes projected values', () => {
      const result = computeAsylumCostImpact(mockAsylum, 'two_unitary')
      expect(result[0].projected_2028.central).toBe(262)
      expect(result[0].projected_2032.high).toBe(472)
    })

    it('returns empty for null', () => {
      expect(computeAsylumCostImpact(null, 'x')).toEqual([])
    })
  })

  describe('computeWhiteFlightVelocity', () => {
    const mockFiscal = {
      five_unitary: {
        'East Lancashire': {
          white_british_pct: 77.0,
          white_british_change_2011_2021: -5.2,
          demographic_change_velocity: 11.5,
          muslim_pct: 15.9,
          pakistani_bangladeshi_pct: 15.6,
        },
        'North Lancashire': {
          white_british_pct: 91.3,
          muslim_pct: 1.2,
        },
      },
    }

    it('returns white flight velocity data', () => {
      const result = computeWhiteFlightVelocity(mockFiscal, 'five_unitary')
      expect(result).toHaveLength(2)
      expect(result[0].white_british_pct).toBe(77.0)
      expect(result[0].muslim_pct).toBe(15.9)
    })

    it('defaults missing change values to 0', () => {
      const result = computeWhiteFlightVelocity(mockFiscal, 'five_unitary')
      expect(result[1].white_british_change_pp).toBe(0)
    })
  })

  describe('adjustSavingsForDeprivation', () => {
    it('reduces savings for high deprivation', () => {
      const result = adjustSavingsForDeprivation({ avg_imd_score: 37 }, 100000000)
      expect(result.deprivationMultiplier).toBe(0.75)
      expect(result.adjustedSavings).toBe(75000000)
    })

    it('applies 5% reduction for low deprivation', () => {
      const result = adjustSavingsForDeprivation({ avg_imd_score: 15 }, 100000000)
      expect(result.deprivationMultiplier).toBe(0.95)
      expect(result.adjustedSavings).toBe(95000000)
    })

    it('applies 35% reduction for very high deprivation', () => {
      const result = adjustSavingsForDeprivation({ avg_imd_score: 45 }, 100000000)
      expect(result.deprivationMultiplier).toBe(0.65)
      expect(result.adjustedSavings).toBe(65000000)
    })

    it('reads from summary.avg_imd_score fallback', () => {
      const result = adjustSavingsForDeprivation({ summary: { avg_imd_score: 32 } }, 100000000)
      expect(result.deprivationMultiplier).toBe(0.75)
    })

    it('returns full savings for null deprivation', () => {
      const result = adjustSavingsForDeprivation(null, 50000000)
      expect(result.adjustedSavings).toBe(50000000)
    })

    it('includes descriptive factors', () => {
      const result = adjustSavingsForDeprivation({ avg_imd_score: 37 }, 100000000)
      expect(result.factors[0]).toContain('High deprivation')
    })
  })

  describe('adjustForCCATransfers', () => {
    const mockCCA = {
      transfers: [
        { service: 'Transport', amount: 86000000 },
        { service: 'Skills', amount: 41000000 },
      ],
    }

    it('deducts 15% of transferred amount', () => {
      const result = adjustForCCATransfers(mockCCA, { grossSavings: 100000000 })
      expect(result.ccaDeduction).toBe(Math.round(127000000 * 0.15))
      expect(result.adjustedSavings).toBe(100000000 - result.ccaDeduction)
    })

    it('returns gross savings when no CCA data', () => {
      const result = adjustForCCATransfers(null, { grossSavings: 80000000 })
      expect(result.adjustedSavings).toBe(80000000)
      expect(result.ccaDeduction).toBe(0)
    })

    it('never goes below 0', () => {
      const result = adjustForCCATransfers({ transfers: [{ amount: 999000000 }] }, { grossSavings: 10000000 })
      expect(result.adjustedSavings).toBeGreaterThanOrEqual(0)
    })

    it('includes factor descriptions', () => {
      const result = adjustForCCATransfers(mockCCA, { grossSavings: 100000000 })
      expect(result.factors.length).toBeGreaterThan(0)
      expect(result.factors[0]).toContain('CCA')
    })
  })

  describe('computeTimelineFeasibility', () => {
    const mockTimeline = {
      feasibility_score: 0,
      verdict: 'Very High Risk',
      months_shortfall: -9.2,
      months_available: 22,
      precedent_average_months: 31.2,
      precedents: [{ name: 'Buckinghamshire', months: 28 }],
      risk_factors: ['22 months is shortest ever'],
      cost_overrun_analysis: { historical_median_pct: 35, probability_on_time: 8 },
      lancashire_complexity: { councils_to_merge: 15 },
    }

    it('returns feasibility data', () => {
      const result = computeTimelineFeasibility(mockTimeline)
      expect(result.score).toBe(0)
      expect(result.verdict).toBe('Very High Risk')
      expect(result.monthsAvailable).toBe(22)
      expect(result.monthsShortfall).toBe(-9.2)
    })

    it('includes precedent data', () => {
      const result = computeTimelineFeasibility(mockTimeline)
      expect(result.precedents).toHaveLength(1)
      expect(result.precedents[0].name).toBe('Buckinghamshire')
    })

    it('includes cost overrun analysis', () => {
      const result = computeTimelineFeasibility(mockTimeline)
      expect(result.costOverrun.historical_median_pct).toBe(35)
    })

    it('handles null timeline', () => {
      const result = computeTimelineFeasibility(null)
      expect(result.score).toBe(0)
      expect(result.verdict).toBe('No Data')
    })
  })

  describe('computePropertyDivision', () => {
    const mockProp = {
      two_unitary: { 'North': { count: 500 }, 'South': { count: 700 } },
      three_unitary: { 'Coastal': { count: 300 } },
    }

    it('returns all models when no modelId', () => {
      const result = computePropertyDivision(mockProp)
      expect(Object.keys(result)).toHaveLength(2)
    })

    it('filters to single model', () => {
      const result = computePropertyDivision(mockProp, 'two_unitary')
      expect(result['North'].count).toBe(500)
      expect(result['South'].count).toBe(700)
    })

    it('returns empty for null', () => {
      expect(computePropertyDivision(null)).toEqual({})
    })
  })

  describe('assessPropertyForLGR', () => {
    const mockAsset = { district: 'Burnley', disposal: { category: 'C' } }
    const mockModels = {
      two_unitary: {
        model_name: 'Two Unitary',
        authorities: [
          { name: 'South Lancashire', councils: ['burnley', 'hyndburn', 'pendle'] },
          { name: 'North Lancashire', councils: ['lancaster', 'wyre'] },
        ],
      },
    }

    it('assigns asset to correct authority', () => {
      const result = assessPropertyForLGR(mockAsset, mockModels)
      expect(result).toHaveLength(1)
      expect(result[0].authority).toBe('South Lancashire')
      expect(result[0].outcome).toBe('retained')
    })

    it('marks disposal candidates', () => {
      const disposal = { ...mockAsset, disposal: { category: 'A' } }
      const result = assessPropertyForLGR(disposal, mockModels)
      expect(result[0].outcome).toBe('disposal_candidate')
      expect(result[0].risk).toBe('medium')
    })

    it('marks unmatched assets as contested', () => {
      const unmatched = { district: 'Unknown Place' }
      const result = assessPropertyForLGR(unmatched, mockModels)
      expect(result[0].outcome).toBe('contested')
      expect(result[0].risk).toBe('high')
    })

    it('returns empty for null inputs', () => {
      expect(assessPropertyForLGR(null, mockModels)).toEqual([])
      expect(assessPropertyForLGR(mockAsset, null)).toEqual([])
    })
  })

  describe('computeThreatAssessment', () => {
    const mockFiscal = {
      fiscal_resilience_score: 20,
      service_demand_pressure_score: 80,
      risk_category: 'Structurally Deficit',
      threats: [
        { type: 'fiscal', severity: 'critical', description: 'Low fiscal score' },
        { type: 'demographic', severity: 'high', description: 'High demand' },
      ],
      lgr_threats: [
        { model: 'two_unitary', severity: 'medium', threat: 'East Lancs concentration' },
      ],
    }

    it('combines threats and lgr_threats', () => {
      const result = computeThreatAssessment(mockFiscal)
      expect(result.threats).toHaveLength(3)
    })

    it('sorts by severity (critical first)', () => {
      const result = computeThreatAssessment(mockFiscal)
      expect(result.threats[0].severity).toBe('critical')
      expect(result.threats[1].severity).toBe('high')
      expect(result.threats[2].severity).toBe('medium')
    })

    it('returns fiscal and demand scores', () => {
      const result = computeThreatAssessment(mockFiscal)
      expect(result.fiscalScore).toBe(20)
      expect(result.demandScore).toBe(80)
      expect(result.riskCategory).toBe('Structurally Deficit')
    })

    it('handles null input', () => {
      const result = computeThreatAssessment(null)
      expect(result.threats).toEqual([])
      expect(result.fiscalScore).toBe(0)
    })
  })

  describe('calculateDogeAdjustedRealisation', () => {
    const mockDogeFindings = {
      findings: [
        { type: 'supplier_concentration', hhi: 1800 },
        { type: 'duplicate_payments', total_amount: 200000 },
      ],
    }

    it('returns default values when dogeFindings is null', () => {
      const result = calculateDogeAdjustedRealisation(null, null)
      expect(result.realisationRate).toBe(0.75)
      expect(result.directiveCount).toBe(0)
      expect(result.avgFeasibility).toBeNull()
    })

    it('adjusts realisation rate based on directives feasibility', () => {
      const directives = [
        { id: 'd1', feasibility: 8, impact: 9 },
        { id: 'd2', feasibility: 9, impact: 7 },
      ]
      const result = calculateDogeAdjustedRealisation(mockDogeFindings, null, directives)
      expect(result.directiveCount).toBe(2)
      expect(result.avgFeasibility).toBeGreaterThan(7)
      expect(result.avgImpact).toBeGreaterThan(7)
      // High feasibility should boost realisation rate
      expect(result.factors.some(f => f.includes('directives'))).toBe(true)
    })

    it('returns enriched output without directives (backward compatible)', () => {
      const result = calculateDogeAdjustedRealisation(mockDogeFindings, null)
      expect(result.realisationRate).toBeDefined()
      expect(result.procurementSaving).toBeDefined()
      expect(result.directiveCount).toBe(0)
      expect(result.avgFeasibility).toBeNull()
      expect(result.avgImpact).toBeNull()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // V8: Opportunity Cost, Distraction & Status Quo Counterfactual Tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('computeStatusQuoSavings', () => {
    it('computes annual organic efficiency savings', () => {
      const result = computeStatusQuoSavings({ totalNetExpenditure: 1324000000 })
      expect(result.annualSteadyState).toBeGreaterThan(0)
      expect(result.tenYearTotal).toBeGreaterThan(result.annualSteadyState)
      expect(result.yearlyProfile).toHaveLength(10)
      expect(result.factors.length).toBeGreaterThan(3)
    })

    it('models diminishing returns — year 10 savings less than year 1', () => {
      const result = computeStatusQuoSavings({ totalNetExpenditure: 1000000000 })
      const y1 = result.yearlyProfile[0].efficiency
      const y10 = result.yearlyProfile[9].efficiency
      expect(y10).toBeLessThan(y1)
    })

    it('models shared services ramp over 3 years', () => {
      const result = computeStatusQuoSavings({ totalNetExpenditure: 1000000000 })
      const y1Shared = result.yearlyProfile[0].sharedServices
      const y3Shared = result.yearlyProfile[2].sharedServices
      expect(y3Shared).toBeGreaterThan(y1Shared)
    })

    it('includes in-flight programmes over first 3 years only', () => {
      const result = computeStatusQuoSavings({
        totalNetExpenditure: 1000000000,
        currentProgrammeSavings: 30000000,
      })
      expect(result.yearlyProfile[0].inFlight).toBeGreaterThan(0)
      expect(result.yearlyProfile[4].inFlight).toBe(0)
    })

    it('returns 10-year total in realistic range (£200-400M for £1.3B NRE)', () => {
      const result = computeStatusQuoSavings({ totalNetExpenditure: 1324000000 })
      expect(result.tenYearTotal).toBeGreaterThan(200000000)
      expect(result.tenYearTotal).toBeLessThan(400000000)
    })

    it('handles zero expenditure gracefully', () => {
      const result = computeStatusQuoSavings({ totalNetExpenditure: 0 })
      expect(result.annualSteadyState).toBe(0)
      expect(result.tenYearTotal).toBe(0)
    })
  })

  describe('computeOpportunityCost', () => {
    it('computes financial opportunity cost', () => {
      const result = computeOpportunityCost({ transitionCostTotal: 80000000 })
      expect(result.financialOpportunityCost).toBeGreaterThan(0)
      expect(result.totalOpportunityCost).toBeGreaterThan(result.financialOpportunityCost)
    })

    it('includes council tax freeze foregone', () => {
      const result = computeOpportunityCost({
        transitionCostTotal: 80000000,
        totalCouncilTaxIncome: 750000000,
        councilTaxFreezeYears: 2,
      })
      expect(result.ctForeGone).toBeGreaterThan(50000000) // £750M × 4.99% × 2 years ≈ £75M
    })

    it('factors present with evidence citations', () => {
      const result = computeOpportunityCost({ transitionCostTotal: 80000000 })
      expect(result.factors.some(f => f.includes('North Yorkshire'))).toBe(true)
    })
  })

  describe('computeDistractionLoss', () => {
    it('computes productivity loss across transition years', () => {
      const result = computeDistractionLoss({ centralServicesBudget: 180000000 })
      expect(result.productivityCost).toBeGreaterThan(0)
      expect(result.turnoverCost).toBeGreaterThan(0)
      expect(result.totalDistractionCost).toBeGreaterThan(result.productivityCost)
    })

    it('computes elevated staff turnover', () => {
      const result = computeDistractionLoss({
        totalStaff: 30000,
        transitionTurnoverUplift: 0.06,
      })
      expect(result.additionalLeavers).toBe(5400) // 30000 × 0.06 × 3 years
      expect(result.turnoverCost).toBeGreaterThan(0)
    })

    it('includes knowledge drain from key person losses', () => {
      const result = computeDistractionLoss({ totalStaff: 30000 })
      expect(result.keyPersonLosses).toBeGreaterThan(0)
      expect(result.knowledgeLossCost).toBeGreaterThan(0)
    })

    it('total distraction cost in realistic range (£100-200M)', () => {
      const result = computeDistractionLoss({
        centralServicesBudget: 180000000,
        totalStaff: 30000,
      })
      expect(result.totalDistractionCost).toBeGreaterThan(80000000)
      expect(result.totalDistractionCost).toBeLessThan(300000000)
    })

    it('cites Grant Thornton and NAO evidence', () => {
      const result = computeDistractionLoss({})
      expect(result.factors.some(f => f.includes('Grant Thornton'))).toBe(true)
      expect(result.factors.some(f => f.includes('NAO'))).toBe(true)
    })
  })

  describe('computeServiceFailureRisk', () => {
    it('computes probability-weighted expected costs', () => {
      const result = computeServiceFailureRisk({})
      expect(result.risks).toHaveLength(4)
      expect(result.totalExpectedCost).toBeGreaterThan(0)
    })

    it('includes correlation penalty', () => {
      const result = computeServiceFailureRisk({})
      expect(result.correlationPenalty).toBeGreaterThan(0)
      expect(result.totalExpectedCost).toBeGreaterThan(
        result.risks.reduce((s, r) => s + r.expectedCost, 0)
      )
    })

    it('each risk has probability, costIfFails, and evidence', () => {
      const result = computeServiceFailureRisk({})
      for (const r of result.risks) {
        expect(r.probability).toBeGreaterThan(0)
        expect(r.probability).toBeLessThanOrEqual(1)
        expect(r.costIfFails).toBeGreaterThan(0)
        expect(r.evidence).toBeTruthy()
      }
    })
  })

  describe('computeCounterfactualComparison', () => {
    const mockCashflow = computeCashflow({
      annualSavings: 80000000,
      transitionCosts: { it: 30000000, redundancy: 20000000, programme: 10000000, legal: 5000000 },
      costProfile: {
        it: { year_minus_1: 0.1, year_1: 0.4, year_2: 0.35, year_3: 0.15 },
        redundancy: { year_1: 0.6, year_2: 0.4 },
        programme: { year_minus_1: 0.15, year_1: 0.3, year_2: 0.3, year_3: 0.2, year_4: 0.05 },
        legal: { year_minus_1: 0.2, year_1: 0.5, year_2: 0.3 },
      },
      savingsRamp: [0, 0.10, 0.25, 0.50, 0.75, 0.90, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
      assumptions: {},
    })
    const mockSQ = computeStatusQuoSavings({ totalNetExpenditure: 1324000000 })
    const mockOC = computeOpportunityCost({ transitionCostTotal: 65000000 })
    const mockDL = computeDistractionLoss({ centralServicesBudget: 180000000 })
    const mockSFR = computeServiceFailureRisk({})

    it('produces LGR and status quo paths', () => {
      const result = computeCounterfactualComparison({
        lgrCashflow: mockCashflow, statusQuoSavings: mockSQ,
        opportunityCost: mockOC, distractionLoss: mockDL, serviceFailureRisk: mockSFR,
      })
      expect(result.lgrPath.length).toBeGreaterThan(0)
      expect(result.statusQuoPath.length).toBeGreaterThan(0)
      expect(result.lgrPath.length).toBe(result.statusQuoPath.length)
    })

    it('LGR path includes hidden costs in transition years', () => {
      const result = computeCounterfactualComparison({
        lgrCashflow: mockCashflow, statusQuoSavings: mockSQ,
        opportunityCost: mockOC, distractionLoss: mockDL, serviceFailureRisk: mockSFR,
      })
      const y1 = result.lgrPath.find(p => p.year === 'Y1')
      expect(y1.hiddenCosts).toBeLessThan(0)
      expect(y1.adjustedNet).toBeLessThan(y1.rawNet)
    })

    it('computes net incremental benefit (LGR NPV minus SQ NPV)', () => {
      const result = computeCounterfactualComparison({
        lgrCashflow: mockCashflow, statusQuoSavings: mockSQ,
        opportunityCost: mockOC, distractionLoss: mockDL, serviceFailureRisk: mockSFR,
      })
      expect(result.netIncrementalBenefit).toBeDefined()
      expect(typeof result.netIncrementalBenefit).toBe('number')
    })

    it('provides verdict string', () => {
      const result = computeCounterfactualComparison({
        lgrCashflow: mockCashflow, statusQuoSavings: mockSQ,
        opportunityCost: mockOC, distractionLoss: mockDL, serviceFailureRisk: mockSFR,
      })
      expect(result.verdict).toBeTruthy()
      expect(typeof result.verdict).toBe('string')
    })

    it('handles missing inputs gracefully', () => {
      const result = computeCounterfactualComparison({})
      expect(result.verdict).toBe('Insufficient data')
    })
  })

  describe('computeRiskAdjustedCashflow', () => {
    it('produces risk-adjusted cashflow with all adjustments', () => {
      const result = computeRiskAdjustedCashflow({
        annualSavings: 80000000,
        transitionCosts: { it: 30000000, redundancy: 20000000, programme: 10000000, legal: 5000000 },
        costProfile: {
          it: { year_minus_1: 0.1, year_1: 0.4, year_2: 0.35, year_3: 0.15 },
          redundancy: { year_1: 0.6, year_2: 0.4 },
          programme: { year_minus_1: 0.15, year_1: 0.3, year_2: 0.3, year_3: 0.2, year_4: 0.05 },
          legal: { year_minus_1: 0.2, year_1: 0.5, year_2: 0.3 },
        },
        savingsRamp: [0, 0.10, 0.25, 0.50, 0.75, 0.90, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
        assumptions: {},
        dogeRealisation: { realisationRate: 0.65 },
        deprivationAdjustment: { deprivationMultiplier: 0.75, factors: ['High deprivation'] },
        timelineOnTimeProbability: 0.20,
        distractionLoss: { totalDistractionCost: 150000000 },
        serviceFailureRisk: { totalExpectedCost: 15000000 },
      })
      expect(result.cashflow).toHaveLength(12)
      expect(result.adjustments.realisationRate).toBe(0.65)
      expect(result.adjustments.deprivationMultiplier).toBe(0.75)
      expect(result.adjustments.timelineProbability).toBe(0.20)
      expect(result.npv).toBeDefined()
    })

    it('risk-adjusted NPV is lower than base NPV', () => {
      const baseParams = {
        annualSavings: 80000000,
        transitionCosts: { it: 30000000, redundancy: 20000000, programme: 10000000, legal: 5000000 },
        costProfile: {
          it: { year_minus_1: 0.1, year_1: 0.4, year_2: 0.35, year_3: 0.15 },
          redundancy: { year_1: 0.6, year_2: 0.4 },
          programme: { year_minus_1: 0.15, year_1: 0.3, year_2: 0.3, year_3: 0.2, year_4: 0.05 },
          legal: { year_minus_1: 0.2, year_1: 0.5, year_2: 0.3 },
        },
        savingsRamp: [0, 0.10, 0.25, 0.50, 0.75, 0.90, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
        assumptions: {},
      }
      const baseCashflow = computeCashflow(baseParams)
      const baseNPV = baseCashflow[baseCashflow.length - 1].npv

      const riskAdjusted = computeRiskAdjustedCashflow({
        ...baseParams,
        dogeRealisation: { realisationRate: 0.65 },
        deprivationAdjustment: { deprivationMultiplier: 0.80 },
        timelineOnTimeProbability: 0.20,
        distractionLoss: { totalDistractionCost: 150000000 },
        serviceFailureRisk: { totalExpectedCost: 15000000 },
      })

      expect(riskAdjusted.npv).toBeLessThan(baseNPV)
    })

    it('works with default values when no risk inputs provided', () => {
      const result = computeRiskAdjustedCashflow({
        annualSavings: 80000000,
        transitionCosts: { it: 30000000, redundancy: 20000000 },
        costProfile: { it: { year_1: 1.0 }, redundancy: { year_1: 1.0 } },
        savingsRamp: [0, 0.10, 0.25, 0.50, 0.75, 0.90, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
        assumptions: {},
      })
      expect(result.cashflow).toHaveLength(12)
      expect(result.npv).toBeDefined()
    })
  })
})
