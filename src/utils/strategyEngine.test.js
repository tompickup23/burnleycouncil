import { describe, it, expect } from 'vitest'
import {
  classifyWard,
  calculateSwingRequired,
  generateTalkingPoints,
  rankBattlegrounds,
  calculatePathToControl,
  classifyWardArchetype,
  generateStrategySummary,
  calculateSwingBetween,
  calculateSwingHistory,
  allocateResources,
  generateStrategyCSV,
  WARD_CLASSES,
} from './strategyEngine'

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

// ---------------------------------------------------------------------------
// calculateSwingRequired
// ---------------------------------------------------------------------------

describe('calculateSwingRequired', () => {
  it('returns Infinity for null prediction', () => {
    expect(calculateSwingRequired(null, 'Labour')).toBe(Infinity)
  })

  it('returns negative swing when we are winning', () => {
    const swing = calculateSwingRequired(safeLabourPred, 'Labour')
    expect(swing).toBeLessThan(0)
  })

  it('returns positive swing when we are losing', () => {
    const swing = calculateSwingRequired(battlegroundPred, 'Labour')
    expect(swing).toBeGreaterThan(0)
  })

  it('calculates Butler swing correctly', () => {
    // Winner has 0.35, we have 0.34, swing = (0.35 - 0.34) / 2 = 0.005
    const swing = calculateSwingRequired(battlegroundPred, 'Labour')
    expect(swing).toBeCloseTo(0.005, 3)
  })

  it('returns zero-ish swing for near-tie', () => {
    const pred = makePrediction({ Labour: 0.40, Conservative: 0.40 }, 'Labour', 0.00)
    const swing = calculateSwingRequired(pred, 'Conservative')
    expect(Math.abs(swing)).toBeLessThan(0.01)
  })
})

// ---------------------------------------------------------------------------
// generateTalkingPoints
// ---------------------------------------------------------------------------

describe('generateTalkingPoints', () => {
  it('returns empty array with no data', () => {
    const points = generateTalkingPoints(null, null, null, null)
    expect(points).toEqual([])
  })

  it('generates over-65 talking point for elderly ward', () => {
    const points = generateTalkingPoints(mockWardElection, mockDemographics, null, null)
    const over65Point = points.find(p => p.text.includes('over-65'))
    expect(over65Point).toBeDefined()
    expect(over65Point.category).toBe('Demographics')
  })

  it('generates ethnic diversity point for diverse ward', () => {
    const points = generateTalkingPoints(mockWardElection, mockDemographics, null, null)
    const diversePoint = points.find(p => p.text.includes('ethnic minority'))
    expect(diversePoint).toBeDefined()
    expect(diversePoint.text).toContain('50%')
  })

  it('generates unemployment point when >6%', () => {
    const points = generateTalkingPoints(mockWardElection, mockDemographics, null, null)
    const unemployPoint = points.find(p => p.text.includes('unemployment'))
    expect(unemployPoint).toBeDefined()
    expect(unemployPoint.category).toBe('Economy')
  })

  it('generates high deprivation point for IMD decile 1-2', () => {
    const points = generateTalkingPoints(mockWardElection, null, mockDeprivationHigh, null)
    const depPoint = points.find(p => p.text.includes('most deprived'))
    expect(depPoint).toBeDefined()
    expect(depPoint.category).toBe('Deprivation')
  })

  it('generates affluent point for IMD decile 9-10', () => {
    const points = generateTalkingPoints(mockWardElection, null, mockDeprivationLow, null)
    const affPoint = points.find(p => p.text.includes('Affluent'))
    expect(affPoint).toBeDefined()
  })

  it('generates low turnout GOTV point', () => {
    const points = generateTalkingPoints(mockWardElection, null, null, null)
    const gotvPoint = points.find(p => p.category === 'GOTV')
    expect(gotvPoint).toBeDefined()
    expect(gotvPoint.text).toContain('22%')
  })

  it('generates high turnout point', () => {
    const points = generateTalkingPoints(mockWardElectionHighTurnout, null, null, null)
    const gotvPoint = points.find(p => p.category === 'GOTV')
    expect(gotvPoint).toBeDefined()
    expect(gotvPoint.text).toContain('High turnout')
  })

  it('generates three-way marginal point', () => {
    const points = generateTalkingPoints(mockWardElection, null, null, threeWayPred)
    const threeWay = points.find(p => p.text.includes('Three-way'))
    expect(threeWay).toBeDefined()
  })

  it('sorts by priority (lowest first)', () => {
    const points = generateTalkingPoints(mockWardElection, mockDemographics, mockDeprivationHigh, null)
    for (let i = 1; i < points.length; i++) {
      expect(points[i].priority).toBeGreaterThanOrEqual(points[i - 1].priority)
    }
  })
})

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
