import { describe, it, expect, vi } from 'vitest'
import {
  classifyWard,
  rankBattlegrounds,
  calculatePathToControl,
  classifyWardArchetype,
  generateStrategySummary,
  calculateSwingBetween,
  calculateSwingHistory,
  allocateResources,
  generateStrategyCSV,
  generateAttackLines,
  generateCouncilAttackLines,
  generateWardDossier,
  generateCanvassingPlaybook,
  computeWardCentroids,
  clusterWards,
  optimiseCanvassingRoute,
  generateCanvassingCSV,
  isQuickWin,
  getBurnleyElectionBriefing,
  BURNLEY_WARD_INTEL,
  WARD_CLASSES,
} from './strategyEngine'

vi.mock('./savingsEngine', () => ({
  financialHealthAssessment: vi.fn(() => ({
    reserves: { monthsCover: 8, rating: 'Adequate', color: '#28a745' },
    resilience: { overallRating: 'Sustainable', overallColor: '#28a745', components: [] },
    materiality: { threshold: 250000 },
    benford_screening: null,
    summary: {
      reserves_months: 8,
      reserves_rating: 'Adequate',
      overall_resilience: 'Sustainable',
      overall_color: '#28a745',
      materiality_threshold: 250000,
    },
  })),
}))

import { financialHealthAssessment } from './savingsEngine'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const makePrediction = (parties, winner, majorityPct = 0.10, confidence = 'medium') => ({
  prediction: Object.fromEntries(
    Object.entries(parties).map(([p, pct]) => [p, { pct, votes: Math.round(pct * 1000) }])
  ),
  winner,
  runnerUp: Object.keys(parties).find(p => p !== winner),
  majority: Math.round(majorityPct * 1000),
  majorityPct,
  estimatedTurnout: 0.30,
  estimatedVotes: 1000,
  confidence,
})

const safeLabourPred = makePrediction(
  { Labour: 0.55, Conservative: 0.25, 'Reform UK': 0.15, 'Liberal Democrats': 0.05 },
  'Labour', 0.30, 'high'
)

const marginalPred = makePrediction(
  { Labour: 0.38, Conservative: 0.34, 'Reform UK': 0.20, 'Liberal Democrats': 0.08 },
  'Labour', 0.04, 'low'
)

const battlegroundPred = makePrediction(
  { Conservative: 0.35, Labour: 0.34, 'Reform UK': 0.22, 'Liberal Democrats': 0.09 },
  'Conservative', 0.01, 'low'
)

const threeWayPred = makePrediction(
  { Labour: 0.34, Conservative: 0.33, 'Reform UK': 0.32, 'Liberal Democrats': 0.01 },
  'Labour', 0.01, 'low'
)

const mockDemographics = {
  name: 'Bank Hall',
  age: {
    'Total: All usual residents': 5000,
    'Aged 15 to 19 years': 400,
    'Aged 20 to 24 years': 350,
    'Aged 25 to 29 years': 300,
    'Aged 65 to 74 years': 600,
    'Aged 75 to 84 years': 400,
    'Aged 85 years and over': 150,
  },
  ethnicity: {
    'Total: All usual residents': 5000,
    'White: English, Welsh, Scottish, Northern Irish or British': 2500,
    'Asian, Asian British or Asian Welsh': 2000,
    'Black, Black British, Black Welsh, Caribbean or African': 300,
  },
  economic_activity: {
    'Total: All usual residents aged 16 years and over': 4000,
    'Unemployed': 360,
  },
}

const mockDeprivationHigh = {
  avg_imd_score: 55,
  avg_imd_rank: 1500,
  avg_imd_decile: 1,
  deprivation_level: 'Very High',
}

const mockDeprivationLow = {
  avg_imd_score: 10,
  avg_imd_rank: 28000,
  avg_imd_decile: 9,
  deprivation_level: 'Low',
}

const mockWardElection = {
  history: [
    {
      date: '2024-05-02',
      year: 2024,
      type: 'borough',
      electorate: 6234,
      turnout: 0.22,
      turnout_votes: 1371,
      candidates: [
        { name: 'A', party: 'Labour', votes: 500, pct: 0.365, elected: true },
        { name: 'B', party: 'Conservative', votes: 400, pct: 0.292, elected: false },
      ],
    },
  ],
}

const mockWardElectionHighTurnout = {
  history: [
    {
      date: '2024-05-02',
      year: 2024,
      type: 'borough',
      electorate: 4000,
      turnout: 0.55,
      turnout_votes: 2200,
      candidates: [],
    },
  ],
}

// ---------------------------------------------------------------------------
// classifyWard
// ---------------------------------------------------------------------------

describe('classifyWard', () => {
  it('returns unknown for null prediction', () => {
    const result = classifyWard(null, 'Labour')
    expect(result.classification).toBe('unknown')
  })

  it('classifies safe hold (>15pp, we defend and win)', () => {
    const result = classifyWard(safeLabourPred, 'Labour', 'Labour')
    expect(result.classification).toBe('safe')
    expect(result.majorityPct).toBe(0.30)
  })

  it('classifies regular hold (5-15pp, we defend and win)', () => {
    const pred = makePrediction({ Labour: 0.42, Conservative: 0.32 }, 'Labour', 0.10)
    const result = classifyWard(pred, 'Labour', 'Labour')
    expect(result.classification).toBe('hold')
  })

  it('classifies marginal hold (<5pp, we defend and win)', () => {
    const result = classifyWard(marginalPred, 'Labour', 'Labour')
    expect(result.classification).toBe('marginal_hold')
  })

  it('classifies target when we gain from opponent (>5pp)', () => {
    const pred = makePrediction({ 'Reform UK': 0.45, Labour: 0.30 }, 'Reform UK', 0.15)
    const result = classifyWard(pred, 'Reform UK', 'Labour')
    expect(result.classification).toBe('target')
  })

  it('classifies battleground when we gain narrowly (<5pp)', () => {
    const pred = makePrediction({ 'Reform UK': 0.36, Labour: 0.35 }, 'Reform UK', 0.01)
    const result = classifyWard(pred, 'Reform UK', 'Labour')
    expect(result.classification).toBe('battleground')
  })

  it('classifies battleground when opponent wins narrowly (<2pp)', () => {
    const result = classifyWard(battlegroundPred, 'Labour', 'Labour')
    expect(result.classification).toBe('battleground')
  })

  it('classifies stretch when opponent has 10-20pp lead and we dont defend', () => {
    const pred = makePrediction({ Labour: 0.50, Conservative: 0.35 }, 'Labour', 0.15)
    const result = classifyWard(pred, 'Reform UK', 'Conservative')
    expect(result.classification).toBe('stretch')
  })

  it('classifies write-off when opponent has >20pp lead', () => {
    const pred = makePrediction({ Labour: 0.60, Conservative: 0.30 }, 'Labour', 0.30)
    const result = classifyWard(pred, 'Reform UK', null)
    expect(result.classification).toBe('write_off')
  })
})

// Tests for unexported calculateSwingRequired and generateTalkingPoints removed —
// covered indirectly through rankBattlegrounds and generateWardDossier tests.

// ---------------------------------------------------------------------------
// classifyWardArchetype
// ---------------------------------------------------------------------------

describe('classifyWardArchetype', () => {
  it('returns unknown with no data', () => {
    const result = classifyWardArchetype(null, null)
    expect(result.archetype).toBe('unknown')
  })

  it('classifies deprived white ward', () => {
    const demo = {
      age: { 'Total: All usual residents': 5000 },
      ethnicity: {
        'Total: All usual residents': 5000,
        'White: English, Welsh, Scottish, Northern Irish or British': 4500,
      },
      economic_activity: { 'Total: All usual residents aged 16 years and over': 4000, 'Unemployed': 200 },
    }
    const result = classifyWardArchetype(demo, { avg_imd_decile: 1 })
    expect(result.archetype).toBe('deprived_white')
    expect(result.label).toBe('Left Behind')
  })

  it('classifies deprived diverse ward', () => {
    const result = classifyWardArchetype(mockDemographics, mockDeprivationHigh)
    expect(result.archetype).toBe('deprived_diverse')
    expect(result.label).toBe('Urban Diverse')
  })

  it('classifies affluent retired ward', () => {
    const demo = {
      age: {
        'Total: All usual residents': 5000,
        'Aged 65 to 74 years': 700,
        'Aged 75 to 84 years': 400,
        'Aged 85 years and over': 100,
      },
      ethnicity: { 'White: English, Welsh, Scottish, Northern Irish or British': 4800 },
      economic_activity: { 'Total: All usual residents aged 16 years and over': 4000, 'Unemployed': 50 },
    }
    const result = classifyWardArchetype(demo, mockDeprivationLow)
    expect(result.archetype).toBe('affluent_retired')
    expect(result.label).toBe('Affluent Retired')
  })

  it('classifies affluent family ward', () => {
    const demo = {
      age: {
        'Total: All usual residents': 5000,
        'Aged 65 to 74 years': 300,
        'Aged 75 to 84 years': 100,
        'Aged 85 years and over': 50,
      },
      ethnicity: { 'White: English, Welsh, Scottish, Northern Irish or British': 4500 },
      economic_activity: { 'Total: All usual residents aged 16 years and over': 4000, 'Unemployed': 100 },
    }
    const result = classifyWardArchetype(demo, mockDeprivationLow)
    expect(result.archetype).toBe('affluent_family')
  })

  it('classifies struggling ward', () => {
    const demo = {
      age: { 'Total: All usual residents': 5000, 'Aged 65 to 74 years': 300, 'Aged 75 to 84 years': 100, 'Aged 85 years and over': 50 },
      ethnicity: { 'White: English, Welsh, Scottish, Northern Irish or British': 4000 },
      economic_activity: { 'Total: All usual residents aged 16 years and over': 4000, 'Unemployed': 400 },
    }
    const result = classifyWardArchetype(demo, { avg_imd_decile: 4 })
    expect(result.archetype).toBe('struggling')
  })

  it('classifies middle ground ward', () => {
    const demo = {
      age: { 'Total: All usual residents': 5000, 'Aged 65 to 74 years': 400, 'Aged 75 to 84 years': 200, 'Aged 85 years and over': 50 },
      ethnicity: { 'White: English, Welsh, Scottish, Northern Irish or British': 4000 },
      economic_activity: { 'Total: All usual residents aged 16 years and over': 4000, 'Unemployed': 200 },
    }
    const result = classifyWardArchetype(demo, { avg_imd_decile: 5 })
    expect(result.archetype).toBe('middle_ground')
  })
})

// ---------------------------------------------------------------------------
// rankBattlegrounds
// ---------------------------------------------------------------------------

describe('rankBattlegrounds', () => {
  const electionsData = {
    next_election: {
      defenders: {
        'Ward A': { party: 'Labour' },
        'Ward B': { party: 'Conservative' },
        'Ward C': { party: 'Reform UK' },
      },
    },
    wards: {
      'Ward A': mockWardElection,
      'Ward B': { history: [{ ...mockWardElection.history[0], electorate: 4000, turnout: 0.45 }] },
      'Ward C': { history: [{ ...mockWardElection.history[0], electorate: 8500, turnout: 0.20 }] },
    },
  }

  const councilPrediction = {
    wards: {
      'Ward A': makePrediction({ Labour: 0.40, 'Reform UK': 0.35, Conservative: 0.25 }, 'Labour', 0.05, 'medium'),
      'Ward B': makePrediction({ 'Reform UK': 0.38, Conservative: 0.36, Labour: 0.26 }, 'Reform UK', 0.02, 'low'),
      'Ward C': makePrediction({ 'Reform UK': 0.50, Labour: 0.30, Conservative: 0.20 }, 'Reform UK', 0.20, 'high'),
    },
  }

  it('returns empty array with no wards', () => {
    expect(rankBattlegrounds([], {}, {}, 'Reform UK', null, null)).toEqual([])
  })

  it('returns ranked wards with scores', () => {
    const result = rankBattlegrounds(
      ['Ward A', 'Ward B', 'Ward C'],
      councilPrediction,
      electionsData,
      'Reform UK',
      null,
      null
    )
    expect(result).toHaveLength(3)
    expect(result[0].ward).toBeDefined()
    expect(result[0].score).toBeGreaterThanOrEqual(0)
    expect(result[0].score).toBeLessThanOrEqual(100)
  })

  it('sorts by score descending', () => {
    const result = rankBattlegrounds(
      ['Ward A', 'Ward B', 'Ward C'],
      councilPrediction,
      electionsData,
      'Reform UK',
      null,
      null
    )
    for (let i = 1; i < result.length; i++) {
      expect(result[i].score).toBeLessThanOrEqual(result[i - 1].score)
    }
  })

  it('includes classification and talking points', () => {
    const result = rankBattlegrounds(
      ['Ward A'],
      councilPrediction,
      electionsData,
      'Reform UK',
      null,
      null
    )
    expect(result[0].classification).toBeDefined()
    expect(result[0].classLabel).toBeDefined()
    expect(result[0].talkingPoints).toBeInstanceOf(Array)
  })

  it('includes swing required', () => {
    const result = rankBattlegrounds(
      ['Ward A', 'Ward B'],
      councilPrediction,
      electionsData,
      'Reform UK',
      null,
      null
    )
    const wardA = result.find(w => w.ward === 'Ward A')
    expect(wardA.swingRequired).toBeGreaterThan(0) // Labour leads
    const wardB = result.find(w => w.ward === 'Ward B')
    expect(wardB.swingRequired).toBeLessThanOrEqual(0) // Reform wins
  })
})

// ---------------------------------------------------------------------------
// calculatePathToControl
// ---------------------------------------------------------------------------

describe('calculatePathToControl', () => {
  it('calculates seats needed for majority', () => {
    const result = calculatePathToControl(
      [],
      { 'Reform UK': 10, Labour: 20 },
      45,
      'Reform UK'
    )
    expect(result.majorityThreshold).toBe(23)
    expect(result.currentSeats).toBe(10)
    expect(result.seatsNeeded).toBe(13)
  })

  it('returns zero seats needed if already majority', () => {
    const result = calculatePathToControl(
      [],
      { 'Reform UK': 30, Labour: 15 },
      45,
      'Reform UK'
    )
    expect(result.seatsNeeded).toBe(0)
  })

  it('identifies vulnerable seats', () => {
    const ranked = [
      { ward: 'W1', defender: 'Reform UK', winner: 'Labour', winProbability: 0.3, classification: 'target', swingRequired: 0.05, score: 50 },
      { ward: 'W2', defender: 'Reform UK', winner: 'Reform UK', winProbability: 0.8, classification: 'hold', swingRequired: -0.05, score: 70 },
    ]
    const result = calculatePathToControl(ranked, { 'Reform UK': 20 }, 45, 'Reform UK')
    expect(result.vulnerable).toHaveLength(1)
    expect(result.vulnerable[0].ward).toBe('W1')
  })

  it('identifies top targets', () => {
    const ranked = [
      { ward: 'W1', defender: 'Labour', winner: 'Reform UK', winProbability: 0.7, classification: 'target', swingRequired: -0.03, score: 80 },
      { ward: 'W2', defender: 'Labour', winner: 'Labour', winProbability: 0.2, classification: 'write_off', swingRequired: 0.15, score: 10 },
    ]
    const result = calculatePathToControl(ranked, { 'Reform UK': 10 }, 45, 'Reform UK')
    expect(result.topTargets).toHaveLength(1)
    expect(result.topTargets[0].ward).toBe('W1')
  })
})

// ---------------------------------------------------------------------------
// generateStrategySummary
// ---------------------------------------------------------------------------

describe('generateStrategySummary', () => {
  it('counts classifications correctly', () => {
    const ranked = [
      { classification: 'safe', defender: 'Reform UK', winner: 'Reform UK', winProbability: 0.9, score: 80 },
      { classification: 'target', defender: 'Labour', winner: 'Reform UK', winProbability: 0.6, score: 60 },
      { classification: 'target', defender: 'Labour', winner: 'Reform UK', winProbability: 0.5, score: 55 },
      { classification: 'write_off', defender: 'Labour', winner: 'Labour', winProbability: 0.1, score: 10 },
    ]
    const summary = generateStrategySummary(ranked, 'Reform UK')
    expect(summary.byClassification.safe).toBe(1)
    expect(summary.byClassification.target).toBe(2)
    expect(summary.byClassification.write_off).toBe(1)
    expect(summary.totalWards).toBe(4)
  })

  it('counts top opportunities (>40% win probability, not defending)', () => {
    const ranked = [
      { classification: 'target', defender: 'Labour', winner: 'Reform UK', winProbability: 0.6, score: 60 },
      { classification: 'target', defender: 'Labour', winner: 'Reform UK', winProbability: 0.3, score: 40 },
    ]
    const summary = generateStrategySummary(ranked, 'Reform UK')
    expect(summary.topOpportunities).toBe(1)
  })

  it('counts vulnerable seats (we defend, opponent predicted to win)', () => {
    const ranked = [
      { classification: 'battleground', defender: 'Reform UK', winner: 'Labour', winProbability: 0.3, score: 50 },
      { classification: 'safe', defender: 'Reform UK', winner: 'Reform UK', winProbability: 0.9, score: 80 },
    ]
    const summary = generateStrategySummary(ranked, 'Reform UK')
    expect(summary.vulnerableSeats).toBe(1)
  })

  it('calculates average score', () => {
    const ranked = [
      { classification: 'target', defender: 'Labour', winner: 'Reform UK', winProbability: 0.5, score: 60 },
      { classification: 'target', defender: 'Labour', winner: 'Reform UK', winProbability: 0.5, score: 40 },
    ]
    const summary = generateStrategySummary(ranked, 'Reform UK')
    expect(summary.avgScore).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// WARD_CLASSES
// ---------------------------------------------------------------------------

describe('WARD_CLASSES', () => {
  it('has all required classifications', () => {
    expect(WARD_CLASSES).toHaveProperty('safe')
    expect(WARD_CLASSES).toHaveProperty('hold')
    expect(WARD_CLASSES).toHaveProperty('marginal_hold')
    expect(WARD_CLASSES).toHaveProperty('battleground')
    expect(WARD_CLASSES).toHaveProperty('target')
    expect(WARD_CLASSES).toHaveProperty('stretch')
    expect(WARD_CLASSES).toHaveProperty('write_off')
  })

  it('each class has label, color, and priority', () => {
    for (const cls of Object.values(WARD_CLASSES)) {
      expect(cls).toHaveProperty('label')
      expect(cls).toHaveProperty('color')
      expect(cls).toHaveProperty('priority')
    }
  })
})

// ---------------------------------------------------------------------------
// calculateSwingBetween
// ---------------------------------------------------------------------------

describe('calculateSwingBetween', () => {
  const election2020 = {
    date: '2020-05-07',
    candidates: [
      { name: 'A', party: 'Labour', votes: 500, pct: 0.40 },
      { name: 'B', party: 'Conservative', votes: 400, pct: 0.32 },
      { name: 'C', party: 'Reform UK', votes: 350, pct: 0.28 },
    ],
  }

  const election2024 = {
    date: '2024-05-02',
    candidates: [
      { name: 'A', party: 'Labour', votes: 380, pct: 0.34 },
      { name: 'B', party: 'Conservative', votes: 330, pct: 0.30 },
      { name: 'C', party: 'Reform UK', votes: 400, pct: 0.36 },
    ],
  }

  it('returns 0 for null elections', () => {
    expect(calculateSwingBetween(null, null, 'Labour', 'Conservative')).toBe(0)
    expect(calculateSwingBetween(election2020, null, 'Labour', 'Conservative')).toBe(0)
  })

  it('calculates Butler swing correctly (Labour→Reform)', () => {
    // Reform gained 0.36 - 0.28 = +0.08
    // Labour lost 0.40 - 0.34 = 0.06
    // Butler swing = (0.08 + 0.06) / 2 = 0.07 towards Reform
    const swing = calculateSwingBetween(election2020, election2024, 'Reform UK', 'Labour')
    expect(swing).toBeCloseTo(0.07, 2)
  })

  it('returns negative swing towards loser', () => {
    // From Labour perspective vs Reform: Labour lost ground
    const swing = calculateSwingBetween(election2020, election2024, 'Labour', 'Reform UK')
    expect(swing).toBeLessThan(0)
  })

  it('handles party not present in one election', () => {
    const electionNoReform = {
      candidates: [
        { name: 'A', party: 'Labour', votes: 600, pct: 0.55 },
        { name: 'B', party: 'Conservative', votes: 490, pct: 0.45 },
      ],
    }
    const swing = calculateSwingBetween(electionNoReform, election2024, 'Reform UK', 'Labour')
    expect(typeof swing).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// calculateSwingHistory
// ---------------------------------------------------------------------------

describe('calculateSwingHistory', () => {
  it('returns empty result for null ward data', () => {
    const result = calculateSwingHistory(null, 'Reform UK')
    expect(result.swings).toEqual([])
    expect(result.trend).toBe('unknown')
  })

  it('returns empty result for empty history', () => {
    const result = calculateSwingHistory({ history: [] }, 'Reform UK')
    expect(result.swings).toEqual([])
    expect(result.trend).toBe('unknown')
  })

  it('returns insufficient trend for single election', () => {
    const result = calculateSwingHistory(mockWardElection, 'Reform UK')
    expect(result.swings).toHaveLength(1)
    expect(result.trend).toBe('insufficient')
  })

  it('calculates swing history for multiple elections', () => {
    const wardData = {
      history: [
        {
          date: '2024-05-02', year: 2024,
          candidates: [
            { party: 'Labour', pct: 0.35, votes: 350 },
            { party: 'Reform UK', pct: 0.30, votes: 300 },
            { party: 'Conservative', pct: 0.20, votes: 200 },
          ],
          turnout: 0.30, electorate: 5000,
        },
        {
          date: '2022-05-05', year: 2022,
          candidates: [
            { party: 'Labour', pct: 0.40, votes: 400 },
            { party: 'Conservative', pct: 0.35, votes: 350 },
            { party: 'Reform UK', pct: 0.15, votes: 150 },
          ],
          turnout: 0.28, electorate: 5000,
        },
        {
          date: '2020-05-07', year: 2020,
          candidates: [
            { party: 'Labour', pct: 0.45, votes: 450 },
            { party: 'Conservative', pct: 0.40, votes: 400 },
          ],
          turnout: 0.25, electorate: 5000,
        },
      ],
    }
    const result = calculateSwingHistory(wardData, 'Reform UK')
    expect(result.swings).toHaveLength(3)
    // Sorted oldest→newest: 2020, 2022, 2024
    expect(result.swings[0].year).toBe(2020)
    expect(result.swings[2].year).toBe(2024)
    // Reform went from 0 → 0.15 → 0.30 = improving
    expect(result.trend).toBe('improving')
    expect(result.avgSwing).toBeGreaterThan(0)
  })

  it('detects declining trend', () => {
    const wardData = {
      history: [
        {
          date: '2024-05-02', year: 2024,
          candidates: [
            { party: 'Labour', pct: 0.50, votes: 500 },
            { party: 'Reform UK', pct: 0.10, votes: 100 },
          ],
          turnout: 0.30,
        },
        {
          date: '2022-05-05', year: 2022,
          candidates: [
            { party: 'Labour', pct: 0.45, votes: 450 },
            { party: 'Reform UK', pct: 0.20, votes: 200 },
          ],
          turnout: 0.28,
        },
        {
          date: '2020-05-07', year: 2020,
          candidates: [
            { party: 'Labour', pct: 0.40, votes: 400 },
            { party: 'Reform UK', pct: 0.30, votes: 300 },
          ],
          turnout: 0.25,
        },
      ],
    }
    const result = calculateSwingHistory(wardData, 'Reform UK')
    expect(result.trend).toBe('declining')
    expect(result.avgSwing).toBeLessThan(0)
  })

  it('calculates volatility', () => {
    const wardData = {
      history: [
        { date: '2024-01-01', year: 2024, candidates: [{ party: 'Reform UK', pct: 0.40, votes: 400 }, { party: 'Labour', pct: 0.60, votes: 600 }], turnout: 0.30 },
        { date: '2022-01-01', year: 2022, candidates: [{ party: 'Reform UK', pct: 0.20, votes: 200 }, { party: 'Labour', pct: 0.80, votes: 800 }], turnout: 0.30 },
        { date: '2020-01-01', year: 2020, candidates: [{ party: 'Reform UK', pct: 0.35, votes: 350 }, { party: 'Labour', pct: 0.65, votes: 650 }], turnout: 0.30 },
      ],
    }
    const result = calculateSwingHistory(wardData, 'Reform UK')
    expect(result.volatility).toBeGreaterThan(0)
  })

  it('includes margin in swing entries', () => {
    const result = calculateSwingHistory(mockWardElection, 'Labour')
    expect(result.swings[0]).toHaveProperty('margin')
    expect(result.swings[0]).toHaveProperty('ourPct')
    expect(result.swings[0]).toHaveProperty('winnerParty')
    expect(result.swings[0]).toHaveProperty('turnout')
  })
})

// ---------------------------------------------------------------------------
// allocateResources
// ---------------------------------------------------------------------------

describe('allocateResources', () => {
  const rankedWards = [
    { ward: 'W1', classification: 'battleground', classLabel: 'Battleground', score: 80, electorate: 5000, turnout: 0.30, winProbability: 0.50 },
    { ward: 'W2', classification: 'target', classLabel: 'Target', score: 60, electorate: 7000, turnout: 0.25, winProbability: 0.40 },
    { ward: 'W3', classification: 'safe', classLabel: 'Safe', score: 90, electorate: 4000, turnout: 0.40, winProbability: 0.85 },
    { ward: 'W4', classification: 'write_off', classLabel: 'Write-off', score: 10, electorate: 6000, turnout: 0.20, winProbability: 0.05 },
    { ward: 'W5', classification: 'marginal_hold', classLabel: 'Marginal Hold', score: 70, electorate: 5500, turnout: 0.32, winProbability: 0.55 },
  ]

  it('returns empty array for empty input', () => {
    expect(allocateResources([])).toEqual([])
    expect(allocateResources(null)).toEqual([])
  })

  it('allocates hours to all wards', () => {
    const result = allocateResources(rankedWards, 1000)
    expect(result).toHaveLength(5)
    for (const r of result) {
      expect(r.hours).toBeGreaterThanOrEqual(0)
      expect(r).toHaveProperty('ward')
      expect(r).toHaveProperty('pctOfTotal')
      expect(r).toHaveProperty('roi')
    }
  })

  it('total hours approximately equals requested total', () => {
    const result = allocateResources(rankedWards, 1000)
    const total = result.reduce((s, r) => s + r.hours, 0)
    // Rounding means it won't be exact
    expect(total).toBeGreaterThan(900)
    expect(total).toBeLessThan(1100)
  })

  it('battleground gets more hours than write-off', () => {
    const result = allocateResources(rankedWards, 1000)
    const bg = result.find(r => r.ward === 'W1')
    const wo = result.find(r => r.ward === 'W4')
    expect(bg.hours).toBeGreaterThan(wo.hours)
  })

  it('sorts by hours descending', () => {
    const result = allocateResources(rankedWards, 1000)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].hours).toBeLessThanOrEqual(result[i - 1].hours)
    }
  })

  it('includes ROI classification', () => {
    const result = allocateResources(rankedWards, 1000)
    for (const r of result) {
      expect(['high', 'medium', 'low']).toContain(r.roi)
    }
  })

  it('includes incremental votes estimate', () => {
    const result = allocateResources(rankedWards, 1000)
    for (const r of result) {
      expect(r.incrementalVotes).toBeGreaterThanOrEqual(0)
      expect(typeof r.incrementalVotes).toBe('number')
    }
  })

  it('includes cost per vote', () => {
    const result = allocateResources(rankedWards, 1000)
    const bg = result.find(r => r.ward === 'W1')
    expect(bg.costPerVote).toBeGreaterThan(0)
    expect(bg.costPerVote).toBeLessThan(100)
  })

  it('scales with total hours', () => {
    const result1000 = allocateResources(rankedWards, 1000)
    const result2000 = allocateResources(rankedWards, 2000)
    const bg1000 = result1000.find(r => r.ward === 'W1')
    const bg2000 = result2000.find(r => r.ward === 'W1')
    // Doubling total hours should roughly double each ward's allocation
    expect(bg2000.hours).toBeGreaterThan(bg1000.hours * 1.5)
  })

  it('respects classification multipliers', () => {
    const result = allocateResources(rankedWards, 5000)
    const safe = result.find(r => r.classification === 'safe')
    const battleground = result.find(r => r.classification === 'battleground')
    // Battleground (1.5× multiplier) should get more than safe (0.2×), even if safe has higher score
    expect(battleground.pctOfTotal).toBeGreaterThan(safe.pctOfTotal)
  })
})

// ---------------------------------------------------------------------------
// generateStrategyCSV
// ---------------------------------------------------------------------------

describe('generateStrategyCSV', () => {
  const rankedWards = [
    {
      ward: 'Bank Hall', classification: 'battleground', classLabel: 'Battleground',
      winner: 'Labour', ourPct: 0.35, swingRequired: 0.025, winProbability: 0.48,
      turnout: 0.28, electorate: 6234, score: 75, defender: 'Labour',
      confidence: 'low', talkingPoints: [
        { category: 'GOTV', text: 'Low turnout — push postal votes' },
        { category: 'Demographics', text: '23% over-65' },
      ],
    },
    {
      ward: 'Briercliffe', classification: 'target', classLabel: 'Target',
      winner: 'Reform UK', ourPct: 0.42, swingRequired: -0.03, winProbability: 0.65,
      turnout: 0.35, electorate: 5000, score: 60, defender: 'Conservative',
      confidence: 'medium', talkingPoints: [],
    },
  ]

  const resourceAllocation = [
    { ward: 'Bank Hall', hours: 400, roi: 'high' },
    { ward: 'Briercliffe', hours: 300, roi: 'medium' },
  ]

  it('returns empty string for empty input', () => {
    expect(generateStrategyCSV([], null, 'Reform UK', 'Burnley')).toBe('')
    expect(generateStrategyCSV(null, null, 'Reform UK', 'Burnley')).toBe('')
  })

  it('generates valid CSV with headers', () => {
    const csv = generateStrategyCSV(rankedWards, resourceAllocation, 'Reform UK', 'Burnley')
    expect(csv).toContain('Rank,Ward,Classification')
    expect(csv).toContain('Predicted Winner')
    expect(csv).toContain('Priority Score')
    expect(csv).toContain('Allocated Hours')
  })

  it('includes council name and party in metadata', () => {
    const csv = generateStrategyCSV(rankedWards, resourceAllocation, 'Reform UK', 'Burnley')
    expect(csv).toContain('# Burnley')
    expect(csv).toContain('Reform UK')
  })

  it('includes ward data rows', () => {
    const csv = generateStrategyCSV(rankedWards, resourceAllocation, 'Reform UK', 'Burnley')
    expect(csv).toContain('"Bank Hall"')
    expect(csv).toContain('"Briercliffe"')
    expect(csv).toContain('Battleground')
    expect(csv).toContain('Target')
  })

  it('includes talking points in CSV', () => {
    const csv = generateStrategyCSV(rankedWards, resourceAllocation, 'Reform UK', 'Burnley')
    expect(csv).toContain('Low turnout')
    expect(csv).toContain('postal votes')
  })

  it('includes resource allocation data', () => {
    const csv = generateStrategyCSV(rankedWards, resourceAllocation, 'Reform UK', 'Burnley')
    expect(csv).toContain('400')
    expect(csv).toContain('high')
  })

  it('works without resource allocation', () => {
    const csv = generateStrategyCSV(rankedWards, null, 'Reform UK', 'Burnley')
    expect(csv).toContain('"Bank Hall"')
    expect(csv).toContain('0') // No hours allocated
  })

  it('generates correct number of data rows', () => {
    const csv = generateStrategyCSV(rankedWards, resourceAllocation, 'Reform UK', 'Burnley')
    const lines = csv.split('\n').filter(l => l && !l.startsWith('#') && !l.startsWith('Rank'))
    expect(lines).toHaveLength(2)
  })

  it('includes date in metadata', () => {
    const csv = generateStrategyCSV(rankedWards, resourceAllocation, 'Reform UK', 'Burnley')
    const today = new Date().toISOString().split('T')[0]
    expect(csv).toContain(today)
  })
})

// ---------------------------------------------------------------------------
// generateAttackLines
// ---------------------------------------------------------------------------

describe('generateAttackLines', () => {
  it('returns empty array for null councillor', () => {
    expect(generateAttackLines(null, null, null)).toEqual([])
  })

  it('flags no executive roles', () => {
    const councillor = { name: 'Alice Smith', party: 'Green Party', roles: [] }
    const lines = generateAttackLines(councillor, null, null)
    const noRoles = lines.find(l => l.text.includes('no executive'))
    expect(noRoles).toBeDefined()
    expect(noRoles.severity).toBe('medium')
    expect(noRoles.text).toContain('Alice Smith')
  })

  it('does not flag no roles if exec roles present', () => {
    const councillor = { name: 'Bob', party: 'Labour', roles: [{ role: 'Executive Member' }] }
    const lines = generateAttackLines(councillor, null, null)
    expect(lines.find(l => l.text.includes('no executive'))).toBeUndefined()
  })

  it('flags integrity red flags', () => {
    const councillor = { name: 'Eve', party: 'Labour', roles: [] }
    const integrity = {
      red_flags: [{ description: 'Undeclared directorship' }, { description: 'Late filing' }],
      integrity_score: 60,
      risk_level: 'elevated',
      total_directorships: 1,
    }
    const lines = generateAttackLines(councillor, integrity, null)
    const flagLine = lines.find(l => l.text.includes('red flag'))
    expect(flagLine).toBeDefined()
    expect(flagLine.severity).toBe('high')
    expect(flagLine.text).toContain('Undeclared directorship')
  })

  it('flags excessive directorships', () => {
    const councillor = { name: 'Frank', party: 'Conservative', roles: [] }
    const integrity = { total_directorships: 5, red_flags: [], integrity_score: 80, risk_level: 'low' }
    const lines = generateAttackLines(councillor, integrity, null)
    const dirLine = lines.find(l => l.text.includes('company directorships'))
    expect(dirLine).toBeDefined()
    expect(dirLine.text).toContain('5')
  })

  it('flags high/elevated risk level', () => {
    const councillor = { name: 'Grace', party: 'Labour', roles: [] }
    const integrity = { risk_level: 'high', integrity_score: 40, red_flags: [], total_directorships: 0 }
    const lines = generateAttackLines(councillor, integrity, null)
    const riskLine = lines.find(l => l.text.includes('Integrity risk level'))
    expect(riskLine).toBeDefined()
    expect(riskLine.severity).toBe('high')
  })

  it('flags declared companies from register of interests', () => {
    const councillor = { name: 'Helen', party: 'Labour', roles: [] }
    const interests = { declared_companies: ['ACME Ltd', 'Widget Corp'] }
    const lines = generateAttackLines(councillor, null, interests)
    const compLine = lines.find(l => l.text.includes('business interest'))
    expect(compLine).toBeDefined()
    expect(compLine.text).toContain('ACME Ltd')
  })

  it('flags excessive employment interests', () => {
    const councillor = { name: 'Ian', party: 'Labour', roles: [] }
    const interests = { declared_employment: ['Job1', 'Job2', 'Job3'] }
    const lines = generateAttackLines(councillor, null, interests)
    expect(lines.find(l => l.text.includes('part-time councillor'))).toBeDefined()
  })

  it('flags declared securities', () => {
    const councillor = { name: 'Jack', party: 'Green Party', roles: [] }
    const interests = { declared_securities: ['Shell PLC shares'] }
    const lines = generateAttackLines(councillor, null, interests)
    expect(lines.find(l => l.text.includes('securities'))).toBeDefined()
  })

  it('excludes "none"/"no" securities', () => {
    const councillor = { name: 'Kate', party: 'Labour', roles: [] }
    const interests = { declared_securities: ['No', 'none'] }
    const lines = generateAttackLines(councillor, null, interests)
    expect(lines.find(l => l.text.includes('securities'))).toBeUndefined()
  })

  it('adds Green Party criticism', () => {
    const lines = generateAttackLines({ name: 'X', party: 'Green Party', roles: [] }, null, null)
    expect(lines.find(l => l.text.includes('virtue-signalling'))).toBeDefined()
  })

  it('adds Labour criticism', () => {
    const lines = generateAttackLines({ name: 'X', party: 'Labour', roles: [] }, null, null)
    expect(lines.find(l => l.text.includes('Starmer'))).toBeDefined()
  })

  it('adds Conservative criticism', () => {
    const lines = generateAttackLines({ name: 'X', party: 'Conservative', roles: [] }, null, null)
    expect(lines.find(l => l.text.includes('14 years'))).toBeDefined()
  })

  it('adds Lib Dem criticism', () => {
    const lines = generateAttackLines({ name: 'X', party: 'Liberal Democrats', roles: [] }, null, null)
    expect(lines.find(l => l.text.includes('tuition fee'))).toBeDefined()
  })

  it('adds Independent criticism', () => {
    const lines = generateAttackLines({ name: 'X', party: 'Independent', roles: [] }, null, null)
    expect(lines.find(l => l.text.includes('no party machine'))).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// generateCouncilAttackLines
// ---------------------------------------------------------------------------

describe('generateCouncilAttackLines', () => {
  it('returns empty array for all null inputs', () => {
    expect(generateCouncilAttackLines(null, null, null, null)).toEqual([])
  })

  it('flags duplicate payments', () => {
    const doge = { findings: [{ label: 'Likely Duplicate Payments', value: '£510K', severity: 'critical' }] }
    const lines = generateCouncilAttackLines(doge, null, null, null)
    const dupLine = lines.find(l => l.text.includes('duplicate'))
    expect(dupLine).toBeDefined()
    expect(dupLine.severity).toBe('high')
    expect(dupLine.category).toBe('Spending')
  })

  it('flags split payments', () => {
    const doge = { findings: [{ label: 'Suspected Split Payments', value: '£5.1M', severity: 'warning' }] }
    const lines = generateCouncilAttackLines(doge, null, null, null)
    expect(lines.find(l => l.text.includes('split'))).toBeDefined()
  })

  it('flags round-number payments', () => {
    const doge = { findings: [{ label: 'Round Number Payments', value: '£2.3M', severity: 'info' }] }
    const lines = generateCouncilAttackLines(doge, null, null, null)
    expect(lines.find(l => l.text.includes('round-number'))).toBeDefined()
  })

  it('flags high fraud triangle score', () => {
    const doge = { fraud_triangle: { overall_score: 75, risk_level: 'elevated' }, findings: [] }
    const lines = generateCouncilAttackLines(doge, null, null, null)
    const ftLine = lines.find(l => l.text.includes('Fraud triangle'))
    expect(ftLine).toBeDefined()
    expect(ftLine.severity).toBe('high')
  })

  it('does not flag low fraud triangle score', () => {
    const doge = { fraud_triangle: { overall_score: 40, risk_level: 'low' }, findings: [] }
    const lines = generateCouncilAttackLines(doge, null, null, null)
    expect(lines.find(l => l.text.includes('Fraud triangle'))).toBeUndefined()
  })

  it('flags supplier concentration', () => {
    const doge = { supplier_concentration: { top5: { suppliers: [{ supplier: 'BigCo', pct: 12 }] } }, findings: [] }
    const lines = generateCouncilAttackLines(doge, null, null, null)
    expect(lines.find(l => l.text.includes('BigCo'))).toBeDefined()
  })

  it('flags low collection rate', () => {
    const rates = { latest_rate: 93.5, trend_direction: 'declining' }
    const lines = generateCouncilAttackLines(null, null, rates, null)
    const rateLine = lines.find(l => l.text.includes('collection rate'))
    expect(rateLine).toBeDefined()
    expect(rateLine.text).toContain('declining')
  })

  it('does not flag good collection rate', () => {
    const rates = { latest_rate: 97.5, trend_direction: 'improving' }
    const lines = generateCouncilAttackLines(null, null, rates, null)
    expect(lines.find(l => l.text.includes('collection rate'))).toBeUndefined()
  })

  it('flags declining reserves', () => {
    const budget = { reserves: { total_opening: 30000000, total_closing: 26000000 } }
    const lines = generateCouncilAttackLines(null, budget, null, null)
    const resLine = lines.find(l => l.text.includes('reserves'))
    expect(resLine).toBeDefined()
    expect(resLine.severity).toBe('high')
  })

  it('flags council tax increase', () => {
    const budget = { council_tax: { band_d_by_year: { '2023-24': 250.0, '2024-25': 268.62 } } }
    const lines = generateCouncilAttackLines(null, budget, null, null)
    expect(lines.find(l => l.text.includes('Band D up'))).toBeDefined()
  })

  it('flags NOC/minority', () => {
    const politics = { coalition: { majority: false, type: 'minority/NOC' } }
    const lines = generateCouncilAttackLines(null, null, null, politics)
    expect(lines.find(l => l.text.includes('No overall control'))).toBeDefined()
  })
})

// Tests for unexported internal helpers (generateNationalLines, buildWardProfile,
// scoreWardPriority, generateCheatSheet) removed — covered indirectly through
// generateWardDossier and rankBattlegrounds tests below.

// ---------------------------------------------------------------------------
// generateWardDossier
// ---------------------------------------------------------------------------

describe('generateWardDossier', () => {
  const minimalAllData = {
    electionsData: {
      meta: { next_election: { date: '2026-05-07', defenders: { 'Test Ward': { party: 'Labour', name: 'John Doe' } } } },
      wards: {
        'Test Ward': {
          current_holders: [{ name: 'John Doe', party: 'Labour' }],
          history: [{
            date: '2024-05-02', year: 2024, electorate: 5000, turnout: 0.30, turnout_votes: 1500,
            candidates: [
              { name: 'John Doe', party: 'Labour', votes: 600, pct: 0.40, elected: true },
              { name: 'Jane Smith', party: 'Conservative', votes: 500, pct: 0.333, elected: false },
              { name: 'Bob Reform', party: 'Reform UK', votes: 400, pct: 0.267, elected: false },
            ],
          }],
        },
      },
    },
    referenceData: null,
    politicsSummary: { coalition: { majority: false, type: 'NOC' } },
    demographicsData: {
      wards: {
        'W01': {
          name: 'Test Ward',
          age: { 'Total: All usual residents': 5000, 'Aged 65 to 74 years': 400, 'Aged 75 to 84 years': 200, 'Aged 85 years and over': 50 },
          ethnicity: { 'Total: All usual residents': 5000, 'White: English, Welsh, Scottish, Northern Irish or British': 4500 },
          economic_activity: { 'Total: All usual residents aged 16 years and over': 4000, 'Unemployed': 200 },
        },
      },
    },
    deprivationData: { wards: { 'Test Ward': { avg_imd_decile: 3, deprivation_level: 'High', avg_imd_rank: 5000, avg_imd_score: 40 } } },
    councillorsData: [{ id: 'c1', name: 'John Doe', party: 'Labour', ward: 'Test Ward', roles: [] }],
    integrityData: { councillors: [{ councillor_id: 'c1', name: 'John Doe', integrity_score: 80, risk_level: 'low', red_flags: [], total_directorships: 1 }] },
    interestsData: { councillors: { c1: { name: 'John Doe', declared_companies: ['Doe Ltd'], declared_employment: [], declared_securities: [] } } },
    dogeFindings: {
      fraud_triangle: { overall_score: 71, risk_level: 'elevated' },
      findings: [{ label: 'Likely Duplicate Payments', value: '£510K', severity: 'critical' }],
    },
    budgetSummary: { reserves: { total_opening: 27000000, total_closing: 26500000 }, council_tax: { band_d_by_year: { '2023-24': 250, '2024-25': 268 } } },
    collectionRates: { latest_rate: 94.04, trend_direction: 'declining', five_year_avg: 93.56 },
    constituenciesData: { constituencies: [{ name: 'Burnley', mp: { name: 'Oliver Ryan', party: 'Labour', expenses: { total_claimed: 235000 } }, ge2024: { results: [{ party: 'Reform UK', pct: 0.248, votes: 9259 }] }, voting_record: { rebellions: 0, total_divisions: 100 }, claimant_count: [{ claimant_rate_pct: 5.6, claimant_count: 3945 }] }] },
    wardConstituencyMap: { 'Test Ward': { constituency_name: 'Burnley' } },
    councilPrediction: {
      wards: {
        'Test Ward': makePrediction(
          { Labour: 0.38, 'Reform UK': 0.34, Conservative: 0.20, 'Liberal Democrats': 0.08 },
          'Labour', 0.04, 'low'
        ),
      },
    },
    rankedWard: null,
    meetingsData: null,
  }

  it('generates a dossier with all sections', () => {
    const dossier = generateWardDossier('Test Ward', minimalAllData)
    expect(dossier.ward).toBe('Test Ward')
    expect(dossier.ourParty).toBe('Reform UK')
    expect(dossier.overallScore).toBeGreaterThan(0)
    expect(dossier.overallScore).toBeLessThanOrEqual(100)
    expect(dossier.profile).toBeDefined()
    expect(dossier.election).toBeDefined()
    expect(dossier.councillors).toBeDefined()
    expect(dossier.councilPerformance).toBeDefined()
    expect(dossier.constituency).toBeDefined()
    expect(dossier.talkingPoints).toBeDefined()
    expect(dossier.cheatSheet).toBeDefined()
  })

  it('populates ward profile from demographics', () => {
    const dossier = generateWardDossier('Test Ward', minimalAllData)
    expect(dossier.profile.population).toBe(5000)
    expect(dossier.profile.whiteBritishPct).toBeCloseTo(0.90, 2)
  })

  it('populates election data', () => {
    const dossier = generateWardDossier('Test Ward', minimalAllData)
    expect(dossier.election.defender).toEqual({ party: 'Labour', name: 'John Doe' })
    expect(dossier.election.prediction.winner).toBe('Labour')
    expect(dossier.election.prediction.ourPct).toBeGreaterThan(0)
  })

  it('populates councillor dossier with attack lines', () => {
    const dossier = generateWardDossier('Test Ward', minimalAllData)
    expect(dossier.councillors).toHaveLength(1)
    expect(dossier.councillors[0].name).toBe('John Doe')
    expect(dossier.councillors[0].attackLines.length).toBeGreaterThan(0)
    expect(dossier.councillors[0].integrity.score).toBe(80)
    expect(dossier.councillors[0].interests.companies).toContain('Doe Ltd')
  })

  it('populates council performance attack lines', () => {
    const dossier = generateWardDossier('Test Ward', minimalAllData)
    expect(dossier.councilPerformance.attackLines.length).toBeGreaterThan(0)
    expect(dossier.councilPerformance.fraudTriangleScore).toBe(71)
    expect(dossier.councilPerformance.collectionRate.latest).toBe(94.04)
  })

  it('populates constituency context', () => {
    const dossier = generateWardDossier('Test Ward', minimalAllData)
    expect(dossier.constituency.name).toBe('Burnley')
    expect(dossier.constituency.mp.name).toBe('Oliver Ryan')
  })

  it('generates talking points in all categories', () => {
    const dossier = generateWardDossier('Test Ward', minimalAllData)
    expect(dossier.talkingPoints.local).toBeInstanceOf(Array)
    expect(dossier.talkingPoints.council.length).toBeGreaterThan(0)
    expect(dossier.talkingPoints.national.length).toBeGreaterThan(0)
    expect(dossier.talkingPoints.constituency.length).toBeGreaterThan(0)
  })

  it('generates cheat sheet', () => {
    const dossier = generateWardDossier('Test Ward', minimalAllData)
    expect(dossier.cheatSheet.wardName).toBe('Test Ward')
    expect(dossier.cheatSheet.defenderParty).toBe('Labour')
    expect(dossier.cheatSheet.target).toBe('Labour → Reform UK')
  })

  it('handles missing optional data gracefully', () => {
    const sparseData = {
      electionsData: { wards: {} },
      referenceData: null,
      politicsSummary: null,
      demographicsData: null,
      deprivationData: null,
      councillorsData: [],
      integrityData: null,
      interestsData: null,
      dogeFindings: null,
      budgetSummary: null,
      collectionRates: null,
      constituenciesData: null,
      wardConstituencyMap: null,
      councilPrediction: null,
      rankedWard: null,
      meetingsData: null,
    }
    const dossier = generateWardDossier('Nonexistent Ward', sparseData)
    expect(dossier.ward).toBe('Nonexistent Ward')
    expect(dossier.councillors).toEqual([])
    expect(dossier.constituency).toBeNull()
    expect(dossier.overallScore).toBeGreaterThanOrEqual(0)
  })

  it('includes scoring factors', () => {
    const dossier = generateWardDossier('Test Ward', minimalAllData)
    expect(dossier.scoringFactors).toBeDefined()
    expect(Object.keys(dossier.scoringFactors)).toHaveLength(7)
  })

  it('uses specified party name', () => {
    const dossier = generateWardDossier('Test Ward', minimalAllData, 'Labour')
    expect(dossier.ourParty).toBe('Labour')
  })

  it('includes fiscal context when budget data is present', () => {
    const dataWithBudget = {
      ...minimalAllData,
      budgetSummary: {
        reserves: { total_opening: 27000000, total_closing: 26500000 },
        net_revenue_expenditure: 45000000,
        council_tax: { dependency_pct: 55, band_d_by_year: { '2024-25': 268 } },
      },
    }
    const dossier = generateWardDossier('Test Ward', dataWithBudget)
    expect(dossier.fiscalContext).not.toBeNull()
    expect(dossier.fiscalContext.reserves_rating).toBe('Adequate')
    expect(dossier.fiscalContext.overall_health).toBe('Sustainable')
  })

  it('returns null fiscal context when no budget data', () => {
    const dataWithoutBudget = { ...minimalAllData, budgetSummary: null }
    const dossier = generateWardDossier('Test Ward', dataWithoutBudget)
    expect(dossier.fiscalContext).toBeNull()
  })

  it('adds critical reserves warning when reserves are below 3 months', () => {
    financialHealthAssessment.mockReturnValueOnce({
      reserves: { monthsCover: 2.1, rating: 'Critical', color: '#dc3545' },
      resilience: { overallRating: 'Critical', overallColor: '#dc3545', components: [] },
      summary: {
        reserves_months: 2.1,
        reserves_rating: 'Critical',
        overall_resilience: 'Critical',
        overall_color: '#dc3545',
        materiality_threshold: 250000,
      },
    })
    const dataWithBudget = {
      ...minimalAllData,
      budgetSummary: {
        reserves: { total_opening: 5000000, total_closing: 4000000 },
        net_revenue_expenditure: 45000000,
        council_tax: { band_d_by_year: { '2024-25': 268 } },
      },
    }
    const dossier = generateWardDossier('Test Ward', dataWithBudget)
    expect(dossier.fiscalContext).not.toBeNull()
    expect(dossier.fiscalContext.reserves_rating).toBe('Critical')
    // Check that a critical fiscal talking point was added
    const fiscalWarning = dossier.talkingPoints.council.find(tp =>
      tp.text.includes('CRITICAL') && tp.text.includes('reserves')
    )
    expect(fiscalWarning).toBeDefined()
    expect(fiscalWarning.priority).toBe(0)
  })
})

// ===========================================================================
// Phase 18e: Geographic + Route Optimisation
// ===========================================================================

const mockBoundaries = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Ward A', centroid: [-2.24, 53.79] }, geometry: { type: 'Polygon', coordinates: [[[-2.25, 53.78], [-2.23, 53.78], [-2.23, 53.80], [-2.25, 53.80], [-2.25, 53.78]]] } },
    { type: 'Feature', properties: { name: 'Ward B', centroid: [-2.22, 53.80] }, geometry: { type: 'Polygon', coordinates: [[[-2.23, 53.79], [-2.21, 53.79], [-2.21, 53.81], [-2.23, 53.81], [-2.23, 53.79]]] } },
    { type: 'Feature', properties: { name: 'Ward C', centroid: [-2.20, 53.77] }, geometry: { type: 'Polygon', coordinates: [[[-2.21, 53.76], [-2.19, 53.76], [-2.19, 53.78], [-2.21, 53.78], [-2.21, 53.76]]] } },
    { type: 'Feature', properties: { name: 'Ward D', centroid: [-2.26, 53.81] }, geometry: { type: 'Polygon', coordinates: [[[-2.27, 53.80], [-2.25, 53.80], [-2.25, 53.82], [-2.27, 53.82], [-2.27, 53.80]]] } },
    { type: 'Feature', properties: { name: 'Ward E', centroid: [-2.18, 53.79] }, geometry: { type: 'Polygon', coordinates: [[[-2.19, 53.78], [-2.17, 53.78], [-2.17, 53.80], [-2.19, 53.80], [-2.19, 53.78]]] } },
    { type: 'Feature', properties: { name: 'Ward F', centroid: [-2.21, 53.82] }, geometry: { type: 'Polygon', coordinates: [[[-2.22, 53.81], [-2.20, 53.81], [-2.20, 53.83], [-2.22, 53.83], [-2.22, 53.81]]] } },
  ],
}

describe('computeWardCentroids', () => {
  it('extracts centroids from GeoJSON features', () => {
    const centroids = computeWardCentroids(mockBoundaries)
    expect(centroids.size).toBe(6)
    expect(centroids.get('Ward A')).toEqual([-2.24, 53.79])
    expect(centroids.get('Ward C')).toEqual([-2.20, 53.77])
  })

  it('returns empty map for null/missing data', () => {
    expect(computeWardCentroids(null).size).toBe(0)
    expect(computeWardCentroids({}).size).toBe(0)
    expect(computeWardCentroids({ features: [] }).size).toBe(0)
  })

  it('skips features without centroids', () => {
    const partial = {
      features: [
        { type: 'Feature', properties: { name: 'Good', centroid: [-2.0, 53.0] }, geometry: {} },
        { type: 'Feature', properties: { name: 'Bad' }, geometry: {} },
      ],
    }
    const centroids = computeWardCentroids(partial)
    expect(centroids.size).toBe(1)
    expect(centroids.has('Good')).toBe(true)
  })
})

describe('clusterWards', () => {
  it('returns single cluster when wards <= maxPerCluster', () => {
    const centroids = computeWardCentroids(mockBoundaries)
    const clusters = clusterWards(centroids, ['Ward A', 'Ward B'], 4)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].wards).toHaveLength(2)
    expect(clusters[0].color).toBeDefined()
  })

  it('creates multiple clusters for many wards', () => {
    const centroids = computeWardCentroids(mockBoundaries)
    const allWards = ['Ward A', 'Ward B', 'Ward C', 'Ward D', 'Ward E', 'Ward F']
    const clusters = clusterWards(centroids, allWards, 3)
    expect(clusters.length).toBeGreaterThanOrEqual(2)
    const totalWards = clusters.reduce((s, c) => s + c.wards.length, 0)
    expect(totalWards).toBe(6)
  })

  it('returns empty array for no wards', () => {
    const centroids = computeWardCentroids(mockBoundaries)
    expect(clusterWards(centroids, [], 4)).toEqual([])
  })

  it('filters out wards without centroids', () => {
    const centroids = computeWardCentroids(mockBoundaries)
    const clusters = clusterWards(centroids, ['Ward A', 'Nonexistent'], 4)
    expect(clusters[0].wards).toEqual(['Ward A'])
  })

  it('each cluster has centroid and color', () => {
    const centroids = computeWardCentroids(mockBoundaries)
    const allWards = ['Ward A', 'Ward B', 'Ward C', 'Ward D', 'Ward E', 'Ward F']
    const clusters = clusterWards(centroids, allWards, 2)
    for (const cluster of clusters) {
      expect(cluster.centroid).toHaveLength(2)
      expect(typeof cluster.color).toBe('string')
      expect(cluster.wards.length).toBeGreaterThan(0)
    }
  })
})

describe('optimiseCanvassingRoute', () => {
  it('returns sessions and route lines', () => {
    const centroids = computeWardCentroids(mockBoundaries)
    const allWards = ['Ward A', 'Ward B', 'Ward C', 'Ward D', 'Ward E', 'Ward F']
    const clusters = clusterWards(centroids, allWards, 3)
    const { sessions, routeLines } = optimiseCanvassingRoute(clusters, centroids, {})
    expect(sessions.length).toBeGreaterThan(0)
    expect(sessions[0].sessionNumber).toBe(1)
    expect(sessions[0].wards).toBeDefined()
    expect(sessions[0].totalHours).toBeGreaterThan(0)
    expect(routeLines.length).toBeGreaterThan(0)
  })

  it('returns empty for no clusters', () => {
    const centroids = computeWardCentroids(mockBoundaries)
    const { sessions, routeLines } = optimiseCanvassingRoute([], centroids, {})
    expect(sessions).toEqual([])
    expect(routeLines).toEqual([])
  })

  it('respects resource allocation hours', () => {
    const centroids = computeWardCentroids(mockBoundaries)
    const clusters = clusterWards(centroids, ['Ward A', 'Ward B'], 4)
    const alloc = { 'Ward A': { hours: 20 }, 'Ward B': { hours: 10 } }
    const { sessions } = optimiseCanvassingRoute(clusters, centroids, alloc)
    expect(sessions[0].totalHours).toBe(30)
  })

  it('each session has visit order and centroids', () => {
    const centroids = computeWardCentroids(mockBoundaries)
    const allWards = ['Ward A', 'Ward B', 'Ward C', 'Ward D', 'Ward E']
    const clusters = clusterWards(centroids, allWards, 3)
    const { sessions } = optimiseCanvassingRoute(clusters, centroids, {})
    for (const session of sessions) {
      for (const ward of session.wards) {
        expect(ward.visitOrder).toBeGreaterThan(0)
        expect(ward.centroid).toHaveLength(2)
        expect(typeof ward.ward).toBe('string')
      }
    }
  })

  it('route lines connect consecutive wards with [lng, lat] pairs', () => {
    const centroids = computeWardCentroids(mockBoundaries)
    const clusters = clusterWards(centroids, ['Ward A', 'Ward B', 'Ward C'], 4)
    const { routeLines } = optimiseCanvassingRoute(clusters, centroids, {})
    for (const [from, to] of routeLines) {
      expect(from).toHaveLength(2)
      expect(to).toHaveLength(2)
    }
  })
})

describe('generateCanvassingCSV', () => {
  it('generates valid CSV with headers', () => {
    const centroids = computeWardCentroids(mockBoundaries)
    const clusters = clusterWards(centroids, ['Ward A', 'Ward B'], 4)
    const { sessions } = optimiseCanvassingRoute(clusters, centroids, {})
    const csv = generateCanvassingCSV(sessions, 'Reform UK', 'Burnley')
    expect(csv).toContain('Session,Visit Order,Ward')
    expect(csv).toContain('Reform UK')
    expect(csv).toContain('Burnley')
  })

  it('includes GPS coordinates', () => {
    const centroids = computeWardCentroids(mockBoundaries)
    const clusters = clusterWards(centroids, ['Ward A'], 4)
    const { sessions } = optimiseCanvassingRoute(clusters, centroids, {})
    const csv = generateCanvassingCSV(sessions, 'Reform UK', 'Burnley')
    expect(csv).toContain('53.') // latitude
    expect(csv).toContain('-2.') // longitude
  })

  it('reports total sessions count', () => {
    const centroids = computeWardCentroids(mockBoundaries)
    const allWards = ['Ward A', 'Ward B', 'Ward C', 'Ward D', 'Ward E', 'Ward F']
    const clusters = clusterWards(centroids, allWards, 3)
    const { sessions } = optimiseCanvassingRoute(clusters, centroids, {})
    const csv = generateCanvassingCSV(sessions, 'Reform UK', 'Test')
    expect(csv).toContain(`${sessions.length} sessions`)
  })
})

// Tests for unexported generateAssetTalkingPoints and generatePropertySummary
// removed — functions are internal helpers called by generateWardDossier.

// ---------------------------------------------------------------------------
// isQuickWin
// ---------------------------------------------------------------------------

describe('isQuickWin', () => {
  it('returns true for matching quick win asset', () => {
    expect(isQuickWin({ disposal_pathway: 'quick_win_auction', disposal_complexity: 20, market_readiness: 70, occupancy_status: 'vacant_land' })).toBe(true)
  })

  it('returns true for private_treaty_sale quick win', () => {
    expect(isQuickWin({ disposal_pathway: 'private_treaty_sale', disposal_complexity: 25, market_readiness: 65, occupancy_status: 'likely_vacant' })).toBe(true)
  })

  it('returns false when complexity too high', () => {
    expect(isQuickWin({ disposal_pathway: 'quick_win_auction', disposal_complexity: 50, market_readiness: 70, occupancy_status: 'vacant_land' })).toBe(false)
  })

  it('returns false when readiness too low', () => {
    expect(isQuickWin({ disposal_pathway: 'quick_win_auction', disposal_complexity: 20, market_readiness: 40, occupancy_status: 'vacant_land' })).toBe(false)
  })

  it('returns false when occupied', () => {
    expect(isQuickWin({ disposal_pathway: 'quick_win_auction', disposal_complexity: 20, market_readiness: 70, occupancy_status: 'occupied' })).toBe(false)
  })

  it('returns false for school_grounds', () => {
    expect(isQuickWin({ disposal_pathway: 'quick_win_auction', disposal_complexity: 10, market_readiness: 80, occupancy_status: 'school_grounds' })).toBe(false)
  })

  it('returns false for strategic_hold pathway', () => {
    expect(isQuickWin({ disposal_pathway: 'strategic_hold', disposal_complexity: 20, market_readiness: 70, occupancy_status: 'vacant_land' })).toBe(false)
  })

  it('handles missing fields gracefully', () => {
    expect(isQuickWin({})).toBe(false)
    expect(isQuickWin({ disposal_pathway: 'quick_win_auction' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// generateCanvassingPlaybook
// ---------------------------------------------------------------------------

describe('generateCanvassingPlaybook', () => {
  const playbookData = {
    electionsData: {
      meta: { next_election: { date: '2026-05-07', defenders: { 'Test Ward': { party: 'Labour', name: 'John Doe' } } } },
      wards: {
        'Test Ward': {
          current_holders: [{ name: 'John Doe', party: 'Labour' }],
          history: [
            { date: '2024-05-02', year: 2024, electorate: 5000, turnout: 0.30, turnout_pct: 30, turnout_votes: 1500,
              winner: 'John Doe', winning_party: 'Labour', margin_pct: 6.7,
              candidates: [
                { name: 'John Doe', party: 'Labour', votes: 600, pct: 0.40, elected: true },
                { name: 'Jane Smith', party: 'Conservative', votes: 500, pct: 0.333, elected: false },
                { name: 'Bob Reform', party: 'Reform UK', votes: 400, pct: 0.267, elected: false },
              ],
            },
            { date: '2022-05-05', year: 2022, electorate: 5100, turnout: 0.35, turnout_pct: 35, turnout_votes: 1785,
              winner: 'John Doe', winning_party: 'Labour', margin_pct: 15.2,
              candidates: [
                { name: 'John Doe', party: 'Labour', votes: 800, pct: 0.45, elected: true },
                { name: 'Jane Smith', party: 'Conservative', votes: 530, pct: 0.297, elected: false },
              ],
            },
          ],
        },
      },
    },
    referenceData: null,
    politicsSummary: { coalition: { majority: false, type: 'NOC' } },
    demographicsData: {
      wards: {
        'W01': {
          name: 'Test Ward',
          age: { 'Total: All usual residents': 5000, 'Aged 65 to 74 years': 400, 'Aged 75 to 84 years': 200, 'Aged 85 years and over': 50 },
          ethnicity: { 'Total: All usual residents': 5000, 'White: English, Welsh, Scottish, Northern Irish or British': 4500 },
          economic_activity: { 'Total: All usual residents aged 16 years and over': 4000, 'Unemployed': 200 },
        },
      },
    },
    deprivationData: { wards: { 'Test Ward': { avg_imd_decile: 3, deprivation_level: 'High', avg_imd_rank: 5000, avg_imd_score: 40 } } },
    councillorsData: [{ id: 'c1', name: 'John Doe', party: 'Labour', ward: 'Test Ward', roles: [] }],
    integrityData: { councillors: [{ councillor_id: 'c1', name: 'John Doe', integrity_score: 80, risk_level: 'low', red_flags: [], total_directorships: 1 }] },
    interestsData: { councillors: { c1: { name: 'John Doe', declared_companies: ['Doe Ltd'], declared_employment: [], declared_securities: [] } } },
    dogeFindings: { fraud_triangle: { overall_score: 71, risk_level: 'elevated' }, findings: [] },
    budgetSummary: { reserves: { total_opening: 27000000, total_closing: 26500000 }, council_tax: { band_d_by_year: { '2023-24': 250, '2024-25': 268 } } },
    collectionRates: { latest_rate: 94.04, trend_direction: 'declining', five_year_avg: 93.56 },
    constituenciesData: { constituencies: [{ name: 'Burnley', mp: { name: 'Oliver Ryan', party: 'Labour' }, ge2024: { results: [{ party: 'Reform UK', pct: 0.248, votes: 9259 }] }, voting_record: { rebellions: 0 } }] },
    wardConstituencyMap: { 'Test Ward': { constituency_name: 'Burnley' } },
    councilPrediction: {
      wards: {
        'Test Ward': makePrediction(
          { Labour: 0.38, 'Reform UK': 0.34, Conservative: 0.20, 'Liberal Democrats': 0.08 },
          'Labour', 0.04, 'low'
        ),
      },
    },
    rankedWard: null,
    meetingsData: null,
  }

  it('generates a complete playbook with all sections', () => {
    const pb = generateCanvassingPlaybook('Test Ward', playbookData)
    expect(pb).not.toBeNull()
    expect(pb.wardName).toBe('Test Ward')
    expect(pb.archetype).toBeDefined()
    expect(pb.openingLines).toBeDefined()
    expect(pb.openingLines.length).toBeGreaterThanOrEqual(3)
    expect(pb.issueResponses).toBeDefined()
    expect(pb.issueResponses.length).toBeGreaterThanOrEqual(5)
    expect(pb.objectionHandling).toBeDefined()
    expect(pb.objectionHandling.length).toBeGreaterThanOrEqual(4)
    expect(pb.closingTechniques).toBeDefined()
    expect(pb.closingTechniques.length).toBeGreaterThanOrEqual(2)
    expect(pb.doorstepDos).toBeDefined()
    expect(pb.doorstepDos.length).toBeGreaterThanOrEqual(5)
    expect(pb.doorstepDonts).toBeDefined()
    expect(pb.doorstepDonts.length).toBeGreaterThanOrEqual(5)
    expect(pb.bodyLanguageTips).toBeDefined()
    expect(pb.bodyLanguageTips.length).toBeGreaterThanOrEqual(5)
  })

  it('opening lines include standard intro with ward name', () => {
    const pb = generateCanvassingPlaybook('Test Ward', playbookData)
    const standardIntro = pb.openingLines.find(l => l.scenario === 'Standard introduction')
    expect(standardIntro).toBeDefined()
    expect(standardIntro.script).toContain('Test Ward')
    expect(standardIntro.script).toContain('Reform UK')
  })

  it('opening lines include busy/interrupted scenario', () => {
    const pb = generateCanvassingPlaybook('Test Ward', playbookData)
    const busy = pb.openingLines.find(l => l.scenario.includes('busy'))
    expect(busy).toBeDefined()
    expect(busy.script).toContain('leaflet')
  })

  it('issue responses cover key topics', () => {
    const pb = generateCanvassingPlaybook('Test Ward', playbookData)
    const issues = pb.issueResponses.map(ir => ir.issue)
    expect(issues).toContain('Council tax — is it good value?')
    expect(issues).toContain('Roads and potholes')
    expect(issues).toContain('NHS and health services')
    expect(issues).toContain('Housing and planning')
  })

  it('objection handling includes "I always vote" response', () => {
    const pb = generateCanvassingPlaybook('Test Ward', playbookData)
    const alwaysVote = pb.objectionHandling.find(o => o.objection.includes('always vote'))
    expect(alwaysVote).toBeDefined()
    expect(alwaysVote.response).toContain('takes your vote for granted')
  })

  it('objection handling includes "never heard of Reform"', () => {
    const pb = generateCanvassingPlaybook('Test Ward', playbookData)
    const neverHeard = pb.objectionHandling.find(o => o.objection.includes('never heard'))
    expect(neverHeard).toBeDefined()
    expect(neverHeard.response).toContain('ground up')
  })

  it('objection handling includes "councillors cant change anything"', () => {
    const pb = generateCanvassingPlaybook('Test Ward', playbookData)
    const cantChange = pb.objectionHandling.find(o => o.objection.includes('change anything'))
    expect(cantChange).toBeDefined()
    expect(cantChange.response).toContain('council tax')
  })

  it('closing techniques include direct ask with election date', () => {
    const pb = generateCanvassingPlaybook('Test Ward', playbookData)
    const direct = pb.closingTechniques.find(ct => ct.technique === 'The direct ask')
    expect(direct).toBeDefined()
    expect(direct.script).toContain('vote')
  })

  it('defender briefing includes councillor information', () => {
    const pb = generateCanvassingPlaybook('Test Ward', playbookData)
    expect(pb.defenderBriefing).toBeDefined()
    expect(pb.defenderBriefing.party).toBe('Labour')
  })

  it('ward intelligence includes turnout history', () => {
    const pb = generateCanvassingPlaybook('Test Ward', playbookData)
    expect(pb.wardIntelligence.turnoutHistory).toBeDefined()
    expect(pb.wardIntelligence.turnoutHistory.length).toBeGreaterThanOrEqual(1)
    expect(pb.wardIntelligence.turnoutHistory[0].year).toBeDefined()
  })

  it('GOTV strategy includes approach and target voters', () => {
    const pb = generateCanvassingPlaybook('Test Ward', playbookData)
    expect(pb.gotv).toBeDefined()
    expect(pb.gotv.approach).toBeDefined()
    expect(pb.gotv.approach.length).toBeGreaterThan(20)
    expect(pb.gotv.targetVoters).toBeDefined()
    expect(pb.gotv.targetVoters.length).toBeGreaterThan(20)
  })

  it('returns playbook even for wards with no election data', () => {
    const pb = generateCanvassingPlaybook('Nonexistent Ward', playbookData)
    // generateWardDossier still creates a dossier, so playbook is generated
    expect(pb).toBeDefined()
    expect(pb.wardName).toBe('Nonexistent Ward')
    expect(pb.openingLines.length).toBeGreaterThanOrEqual(2)
  })

  it('handles sparse data gracefully', () => {
    const sparse = { electionsData: { wards: {}, meta: {} }, demographicsData: null, deprivationData: null, councillorsData: [] }
    const pb = generateCanvassingPlaybook('Test Ward', sparse)
    // Should still generate something usable, even with minimal data
    expect(pb).toBeDefined()
    expect(pb.openingLines.length).toBeGreaterThanOrEqual(2)
    expect(pb.bodyLanguageTips.length).toBeGreaterThanOrEqual(5)
  })

  it('dos list includes listening guidance', () => {
    const pb = generateCanvassingPlaybook('Test Ward', playbookData)
    const listenDo = pb.doorstepDos.find(d => d.toLowerCase().includes('listen'))
    expect(listenDo).toBeDefined()
  })

  it('donts list includes arguing warning', () => {
    const pb = generateCanvassingPlaybook('Test Ward', playbookData)
    const argDont = pb.doorstepDonts.find(d => d.toLowerCase().includes('argue'))
    expect(argDont).toBeDefined()
  })

  it('includes localIssues from elections.json reform_candidates', () => {
    const dataWithReform = {
      ...playbookData,
      electionsData: {
        ...playbookData.electionsData,
        meta: {
          next_election: {
            reform_candidates: {
              'Test Ward': {
                candidate: 'John Smith',
                local_issues: ['council tax up 5%', 'road repairs delayed'],
              },
            },
          },
        },
      },
    }
    const pb = generateCanvassingPlaybook('Test Ward', dataWithReform)
    expect(pb.localIssues).toEqual(['council tax up 5%', 'road repairs delayed'])
  })

  it('falls back to BURNLEY_WARD_INTEL for known wards', () => {
    const pb = generateCanvassingPlaybook('Daneshouse with Stoneyholme', playbookData)
    expect(pb.wardTier).toBe('must_win')
    expect(pb.wardOpportunity).toBe(95)
    expect(pb.localIssues.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// BURNLEY_WARD_INTEL constant
// ---------------------------------------------------------------------------

describe('BURNLEY_WARD_INTEL', () => {
  it('contains all 15 Burnley wards', () => {
    expect(Object.keys(BURNLEY_WARD_INTEL)).toHaveLength(15)
  })

  it('has must_win tier for core targets', () => {
    expect(BURNLEY_WARD_INTEL['Daneshouse with Stoneyholme'].tier).toBe('must_win')
    expect(BURNLEY_WARD_INTEL['Queensgate'].tier).toBe('must_win')
    expect(BURNLEY_WARD_INTEL['Trinity'].tier).toBe('must_win')
  })

  it('has defend tier for Reform-held seats', () => {
    expect(BURNLEY_WARD_INTEL['Hapton with Park'].tier).toBe('defend')
    expect(BURNLEY_WARD_INTEL['Whittlefield with Ightenhill'].tier).toBe('defend')
  })

  it('has UKIP heritage data for relevant wards', () => {
    expect(BURNLEY_WARD_INTEL['Daneshouse with Stoneyholme'].ukip_peak).toBe(49.2)
    expect(BURNLEY_WARD_INTEL['Queensgate'].ukip_peak).toBe(40.3)
    expect(BURNLEY_WARD_INTEL['Brunshaw'].ukip_peak).toBe(0)
  })

  it('each ward has local_issues array', () => {
    for (const [ward, intel] of Object.entries(BURNLEY_WARD_INTEL)) {
      expect(intel.local_issues).toBeDefined()
      expect(Array.isArray(intel.local_issues)).toBe(true)
      expect(intel.local_issues.length).toBeGreaterThan(0)
    }
  })

  it('each ward has messaging string', () => {
    for (const [ward, intel] of Object.entries(BURNLEY_WARD_INTEL)) {
      expect(typeof intel.messaging).toBe('string')
      expect(intel.messaging.length).toBeGreaterThan(10)
    }
  })

  it('opportunity scores range 0-100', () => {
    for (const intel of Object.values(BURNLEY_WARD_INTEL)) {
      expect(intel.opportunity).toBeGreaterThanOrEqual(0)
      expect(intel.opportunity).toBeLessThanOrEqual(100)
    }
  })
})

// ---------------------------------------------------------------------------
// getBurnleyElectionBriefing
// ---------------------------------------------------------------------------

describe('getBurnleyElectionBriefing', () => {
  const burnleyElections = {
    meta: {
      next_election: {
        date: '2026-05-07',
        type: 'borough_thirds',
        seats_up: 15,
        wards_up: [
          'Bank Hall', 'Briercliffe', 'Brunshaw', 'Cliviger with Worsthorne',
          'Coalclough with Deerplay', 'Daneshouse with Stoneyholme', 'Gannow',
          'Gawthorpe', 'Hapton with Park', 'Lanehead', 'Queensgate',
          'Rosegrove with Lowerhouse', 'Rosehill with Burnley Wood', 'Trinity',
          'Whittlefield with Ightenhill',
        ],
        defenders: {
          'Daneshouse with Stoneyholme': { name: 'Shah Hussain', party: 'Labour', elected_year: 2022 },
          'Coalclough with Deerplay': { name: 'Gordon Birtwistle', party: 'Liberal Democrats', elected_year: 2022 },
          'Hapton with Park': { name: 'Jamie McGowan', party: 'Reform UK', elected_year: 2022 },
        },
        reform_candidates: {
          'Daneshouse with Stoneyholme': {
            candidate: 'TBC',
            local_issues: ['highest deprivation', 'unemployment 10%'],
          },
          'Hapton with Park': {
            candidate: 'Jamie McGowan (Reform UK incumbent)',
            local_issues: ['maintaining Reform representation'],
          },
        },
        ward_intel: {
          current_reform_seats: {
            'Hapton with Park': ['Jamie McGowan'],
            'Whittlefield with Ightenhill': ['Alan Hosker'],
            'Trinity': ['Jeff Sumner'],
          },
          ukip_heritage_wards: {
            'Daneshouse with Stoneyholme': { peak_pct: 49.2, peak_year: 2015 },
          },
          election_summary: '15 seats contested May 7 2026.',
        },
      },
    },
    wards: {
      'Coalclough with Deerplay': {
        history: [
          { year: 2024, turnout_votes: 800, candidates: [{ party: 'Liberal Democrats', votes: 400 }, { party: 'Labour', votes: 200 }, { party: 'Conservative', votes: 100 }] },
          { year: 2022, turnout_votes: 700, candidates: [{ party: 'Liberal Democrats', votes: 350 }, { party: 'Labour', votes: 200 }] },
          { year: 2019, turnout_votes: 1200, candidates: [{ party: 'Liberal Democrats', votes: 380 }, { party: 'Independent', votes: 350 }] },
        ],
      },
      'Daneshouse with Stoneyholme': {
        history: [
          { year: 2022, turnout_votes: 500, candidates: [{ party: 'Labour', votes: 250 }, { party: 'Independent', votes: 150 }] },
        ],
      },
    },
  }

  it('returns null for non-Burnley 2026 election data', () => {
    expect(getBurnleyElectionBriefing({ meta: { next_election: { date: '2027-05-06' } } })).toBeNull()
    expect(getBurnleyElectionBriefing(null)).toBeNull()
    expect(getBurnleyElectionBriefing({})).toBeNull()
  })

  it('returns briefing with correct election metadata', () => {
    const briefing = getBurnleyElectionBriefing(burnleyElections)
    expect(briefing.election_date).toBe('2026-05-07')
    expect(briefing.seats_contested).toBe(15)
    expect(briefing.wards_contested).toBe(15)
    expect(briefing.current_reform_seats).toBe(3)
  })

  it('generates ward briefings sorted by opportunity', () => {
    const briefing = getBurnleyElectionBriefing(burnleyElections)
    expect(briefing.ward_briefings).toHaveLength(15)
    // First should be highest opportunity
    const opportunities = briefing.ward_briefings.map(w => w.opportunity)
    for (let i = 1; i < opportunities.length; i++) {
      expect(opportunities[i]).toBeLessThanOrEqual(opportunities[i - 1])
    }
  })

  it('includes priority tiers', () => {
    const briefing = getBurnleyElectionBriefing(burnleyElections)
    expect(briefing.tiers.must_win.length).toBe(3)
    expect(briefing.tiers.defend.length).toBe(2)
    expect(briefing.tiers.long_shot.length).toBe(2)
  })

  it('includes Coalclough deep-dive', () => {
    const briefing = getBurnleyElectionBriefing(burnleyElections)
    expect(briefing.coalclough_deep_dive).toBeDefined()
    expect(briefing.coalclough_deep_dive.tenure_years).toBe(43)
    expect(briefing.coalclough_deep_dive.defender).toContain('Birtwistle')
    expect(briefing.coalclough_deep_dive.vulnerability_analysis.length).toBeGreaterThan(3)
    expect(briefing.coalclough_deep_dive.margin_trajectory.length).toBeGreaterThan(0)
  })

  it('includes resource allocation recommendations', () => {
    const briefing = getBurnleyElectionBriefing(burnleyElections)
    expect(briefing.resource_allocation).toBeDefined()
    expect(briefing.resource_allocation.must_win).toContain('50%')
    expect(briefing.resource_allocation.long_shot).toContain('2%')
  })

  it('includes UKIP heritage data', () => {
    const briefing = getBurnleyElectionBriefing(burnleyElections)
    expect(briefing.ukip_heritage_wards['Daneshouse with Stoneyholme'].peak_pct).toBe(49.2)
  })

  it('ward briefing includes defender and reform candidate info', () => {
    const briefing = getBurnleyElectionBriefing(burnleyElections)
    const daneshouse = briefing.ward_briefings.find(w => w.ward === 'Daneshouse with Stoneyholme')
    expect(daneshouse.defender.name).toBe('Shah Hussain')
    expect(daneshouse.defender.party).toBe('Labour')
    expect(daneshouse.local_issues).toContain('highest deprivation')
  })

  it('calculates margin trends for wards with history', () => {
    const briefing = getBurnleyElectionBriefing(burnleyElections)
    const coalclough = briefing.ward_briefings.find(w => w.ward === 'Coalclough with Deerplay')
    expect(coalclough.margin_trend).toBeDefined()
    expect(['narrowing', 'widening', 'insufficient_data']).toContain(coalclough.margin_trend)
    expect(coalclough.recent_margins.length).toBeGreaterThan(0)
  })
})
