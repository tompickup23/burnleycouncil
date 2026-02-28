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
  generateAttackLines,
  generateCouncilAttackLines,
  generateNationalLines,
  buildWardProfile,
  scoreWardPriority,
  generateCheatSheet,
  generateWardDossier,
  computeWardCentroids,
  clusterWards,
  optimiseCanvassingRoute,
  generateCanvassingCSV,
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

// ---------------------------------------------------------------------------
// generateNationalLines
// ---------------------------------------------------------------------------

describe('generateNationalLines', () => {
  it('returns at least council tax line with no data', () => {
    const lines = generateNationalLines(null, null, null, 'Reform UK')
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.find(l => l.text.includes('Council tax'))).toBeDefined()
  })

  it('adds immigration line for high White British area', () => {
    const demo = {
      age: { 'Total: All usual residents': 5000 },
      ethnicity: { 'White: English, Welsh, Scottish, Northern Irish or British': 4800 },
    }
    const lines = generateNationalLines(null, demo, null, 'Reform UK')
    expect(lines.find(l => l.text.includes('Stop the boats'))).toBeDefined()
  })

  it('does not add immigration line for diverse area', () => {
    const demo = {
      age: { 'Total: All usual residents': 5000 },
      ethnicity: { 'White: English, Welsh, Scottish, Northern Irish or British': 2500 },
    }
    const lines = generateNationalLines(null, demo, null, 'Reform UK')
    expect(lines.find(l => l.text.includes('Stop the boats'))).toBeUndefined()
  })

  it('adds NHS line for elderly ward', () => {
    const demo = {
      age: {
        'Total: All usual residents': 5000,
        'Aged 65 to 74 years': 600,
        'Aged 75 to 84 years': 400,
        'Aged 85 years and over': 150,
      },
    }
    const lines = generateNationalLines(null, demo, null, 'Reform UK')
    expect(lines.find(l => l.text.includes('NHS'))).toBeDefined()
  })

  it('adds cost of living line for deprived ward', () => {
    const dep = { avg_imd_decile: 2 }
    const lines = generateNationalLines(null, null, dep, 'Reform UK')
    expect(lines.find(l => l.text.includes('Cost of living'))).toBeDefined()
  })

  it('does not add cost of living for affluent ward', () => {
    const dep = { avg_imd_decile: 9 }
    const lines = generateNationalLines(null, null, dep, 'Reform UK')
    expect(lines.find(l => l.text.includes('Cost of living'))).toBeUndefined()
  })

  it('adds anti-establishment line for Reform', () => {
    const lines = generateNationalLines(null, null, null, 'Reform UK')
    expect(lines.find(l => l.text.includes('Time for Reform'))).toBeDefined()
  })

  it('does not add anti-establishment for non-Reform', () => {
    const lines = generateNationalLines(null, null, null, 'Labour')
    expect(lines.find(l => l.text.includes('Time for Reform'))).toBeUndefined()
  })

  it('adds GE2024 constituency result', () => {
    const constituency = {
      ge2024: { results: [{ party: 'Reform UK', pct: 0.248, votes: 9259 }] },
    }
    const lines = generateNationalLines(constituency, null, null, 'Reform UK')
    const geLine = lines.find(l => l.text.includes('General Election'))
    expect(geLine).toBeDefined()
    expect(geLine.text).toContain('24.8%')
    expect(geLine.category).toBe('Constituency')
  })

  it('adds MP criticism for zero rebellions', () => {
    const constituency = {
      mp: { name: 'Oliver Ryan', party: 'Labour' },
      voting_record: { rebellions: 0, total_divisions: 100 },
    }
    const lines = generateNationalLines(constituency, null, null, 'Reform UK')
    expect(lines.find(l => l.text.includes('lobby fodder'))).toBeDefined()
  })

  it('adds MP expenses criticism', () => {
    const constituency = {
      mp: { name: 'Oliver Ryan', party: 'Labour', expenses: { total_claimed: 250000 } },
    }
    const lines = generateNationalLines(constituency, null, null, 'Reform UK')
    expect(lines.find(l => l.text.includes('expenses'))).toBeDefined()
  })

  it('adds claimant count line for high rate', () => {
    const constituency = {
      claimant_count: [{ claimant_rate_pct: 5.6, claimant_count: 3945 }],
    }
    const lines = generateNationalLines(constituency, null, null, 'Reform UK')
    expect(lines.find(l => l.text.includes('claimant rate'))).toBeDefined()
  })

  it('sorts by priority', () => {
    const demo = {
      age: { 'Total: All usual residents': 5000, 'Aged 65 to 74 years': 600, 'Aged 75 to 84 years': 400, 'Aged 85 years and over': 150 },
      ethnicity: { 'White: English, Welsh, Scottish, Northern Irish or British': 4800 },
    }
    const lines = generateNationalLines(null, demo, { avg_imd_decile: 2 }, 'Reform UK')
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].priority).toBeGreaterThanOrEqual(lines[i - 1].priority)
    }
  })
})

// ---------------------------------------------------------------------------
// buildWardProfile
// ---------------------------------------------------------------------------

describe('buildWardProfile', () => {
  it('returns zeroed profile with no data', () => {
    const profile = buildWardProfile(null, null, null, null)
    expect(profile.population).toBe(0)
    expect(profile.over65Pct).toBe(0)
    expect(profile.deprivation).toBeNull()
    expect(profile.constituency).toBeNull()
  })

  it('calculates over-65 percentage', () => {
    const profile = buildWardProfile(mockDemographics, null, null, null)
    // (600+400+150)/5000 = 0.23
    expect(profile.over65Pct).toBeCloseTo(0.23, 2)
  })

  it('calculates white british percentage', () => {
    const profile = buildWardProfile(mockDemographics, null, null, null)
    // 2500/5000 = 0.50
    expect(profile.whiteBritishPct).toBeCloseTo(0.50, 2)
  })

  it('calculates unemployment percentage', () => {
    const profile = buildWardProfile(mockDemographics, null, null, null)
    // 360/4000 = 0.09
    expect(profile.unemploymentPct).toBeCloseTo(0.09, 2)
  })

  it('includes deprivation data', () => {
    const profile = buildWardProfile(null, mockDeprivationHigh, null, null)
    expect(profile.deprivation).toEqual({ decile: 1, level: 'Very High', rank: 1500, score: 55 })
  })

  it('includes constituency name', () => {
    const profile = buildWardProfile(null, null, null, 'Burnley')
    expect(profile.constituency).toBe('Burnley')
  })

  it('includes electorate from election data', () => {
    const profile = buildWardProfile(null, null, mockWardElection, null)
    expect(profile.electorate).toBe(6234)
  })

  it('includes archetype classification', () => {
    const profile = buildWardProfile(mockDemographics, mockDeprivationHigh, null, null)
    expect(profile.archetype).toBeDefined()
    expect(profile.archetype.archetype).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// scoreWardPriority
// ---------------------------------------------------------------------------

describe('scoreWardPriority', () => {
  it('returns a score between 0 and 100', () => {
    const result = scoreWardPriority({})
    expect(result.total).toBeGreaterThanOrEqual(0)
    expect(result.total).toBeLessThanOrEqual(100)
  })

  it('returns all 7 factors', () => {
    const result = scoreWardPriority({})
    expect(Object.keys(result.factors)).toHaveLength(7)
    expect(result.factors).toHaveProperty('winProbability')
    expect(result.factors).toHaveProperty('reformMomentum')
    expect(result.factors).toHaveProperty('efficiency')
    expect(result.factors).toHaveProperty('turnoutOpportunity')
    expect(result.factors).toHaveProperty('incumbentVulnerability')
    expect(result.factors).toHaveProperty('demographicAlignment')
    expect(result.factors).toHaveProperty('councilDissatisfaction')
  })

  it('scores higher with high win probability', () => {
    const high = scoreWardPriority({ winProbability: 0.9 })
    const low = scoreWardPriority({ winProbability: 0.1 })
    expect(high.total).toBeGreaterThan(low.total)
  })

  it('scores higher with improving swing trend', () => {
    const improving = scoreWardPriority({ swingHistory: { trend: 'improving' }, constituencyReformPct: 0.25 })
    const declining = scoreWardPriority({ swingHistory: { trend: 'declining' }, constituencyReformPct: 0.25 })
    expect(improving.total).toBeGreaterThan(declining.total)
  })

  it('scores higher with smaller electorate', () => {
    const small = scoreWardPriority({ electorate: 3000 })
    const large = scoreWardPriority({ electorate: 12000 })
    expect(small.factors.efficiency.value).toBeGreaterThan(large.factors.efficiency.value)
  })

  it('scores higher with low turnout', () => {
    const low = scoreWardPriority({ turnout: 0.20 })
    const high = scoreWardPriority({ turnout: 0.55 })
    expect(low.factors.turnoutOpportunity.value).toBeGreaterThan(high.factors.turnoutOpportunity.value)
  })

  it('scores higher with vulnerable incumbent', () => {
    const vulnerable = scoreWardPriority({ integrityScore: 40, redFlagCount: 4, hasExecRoles: false })
    const strong = scoreWardPriority({ integrityScore: 100, redFlagCount: 0, hasExecRoles: true })
    expect(vulnerable.factors.incumbentVulnerability.value).toBeGreaterThan(strong.factors.incumbentVulnerability.value)
  })

  it('scores higher for Reform-aligned demographics', () => {
    const aligned = scoreWardPriority({ whiteBritishPct: 0.95, over65Pct: 0.30, deprivationDecile: 2 })
    const misaligned = scoreWardPriority({ whiteBritishPct: 0.30, over65Pct: 0.10, deprivationDecile: 9 })
    expect(aligned.factors.demographicAlignment.value).toBeGreaterThan(misaligned.factors.demographicAlignment.value)
  })

  it('scores higher with council dissatisfaction', () => {
    const bad = scoreWardPriority({ fraudTriangleScore: 80, collectionRate: 92, dogeHighSeverityCount: 5 })
    const good = scoreWardPriority({ fraudTriangleScore: 20, collectionRate: 98, dogeHighSeverityCount: 0 })
    expect(bad.factors.councilDissatisfaction.value).toBeGreaterThan(good.factors.councilDissatisfaction.value)
  })

  it('factor weights sum to 100', () => {
    const result = scoreWardPriority({})
    const totalWeight = Object.values(result.factors).reduce((s, f) => s + f.weight, 0)
    expect(totalWeight).toBe(100)
  })

  it('weighted values are integers', () => {
    const result = scoreWardPriority({ winProbability: 0.73, constituencyReformPct: 0.18 })
    for (const f of Object.values(result.factors)) {
      expect(Number.isInteger(f.weighted)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// generateCheatSheet
// ---------------------------------------------------------------------------

describe('generateCheatSheet', () => {
  it('returns null for null dossier', () => {
    expect(generateCheatSheet(null)).toBeNull()
  })

  it('returns ward name and election date', () => {
    const dossier = {
      ward: 'Cliviger with Worsthorne',
      electionDate: '2026-05-07',
      ourParty: 'Reform UK',
      profile: { population: 5061, over65Pct: 0.318, whiteBritishPct: 0.979 },
      election: { defender: { party: 'Green Party', name: 'Jack Launer' }, prediction: { swingRequired: 0.12 } },
      talkingPoints: { local: [], council: [], national: [], constituency: [] },
    }
    const sheet = generateCheatSheet(dossier)
    expect(sheet.wardName).toBe('Cliviger with Worsthorne')
    expect(sheet.electionDate).toBe('2026-05-07')
  })

  it('builds target line', () => {
    const dossier = {
      ward: 'Test', ourParty: 'Reform UK', profile: {},
      election: { defender: { party: 'Green Party' }, prediction: { swingRequired: 0.05 } },
      talkingPoints: { local: [], council: [], national: [], constituency: [] },
    }
    const sheet = generateCheatSheet(dossier)
    expect(sheet.target).toBe('Green Party → Reform UK')
  })

  it('selects top 5 talking points from all sources', () => {
    const dossier = {
      ward: 'Test', ourParty: 'Reform UK', profile: {},
      election: { defender: { party: 'Labour' }, prediction: {} },
      talkingPoints: {
        local: [
          { priority: 1, text: 'Local A' },
          { priority: 3, text: 'Local B' },
        ],
        council: [
          { priority: 1, text: 'Council A' },
          { priority: 2, text: 'Council B' },
        ],
        national: [
          { priority: 1, text: 'National A' },
          { priority: 2, text: 'National B' },
        ],
        constituency: [
          { priority: 1, text: 'Constituency A' },
        ],
      },
    }
    const sheet = generateCheatSheet(dossier)
    expect(sheet.top5TalkingPoints).toHaveLength(5)
    // Top 5 should be all priority-1 items first
    expect(sheet.top5TalkingPoints[0].priority).toBe(1)
  })

  it('generates key stats from profile', () => {
    const dossier = {
      ward: 'Test', ourParty: 'Reform UK',
      profile: { population: 5061, over65Pct: 0.318, whiteBritishPct: 0.979, deprivation: { decile: 7.5 } },
      election: { defender: { party: 'Green Party' }, prediction: {} },
      talkingPoints: { local: [], council: [], national: [], constituency: [] },
    }
    const sheet = generateCheatSheet(dossier)
    expect(sheet.keyStats.length).toBeGreaterThan(0)
    expect(sheet.keyStats.find(s => s.includes('5,061'))).toBeDefined()
    expect(sheet.keyStats.find(s => s.includes('32%'))).toBeDefined()
  })

  it('adds do-not-say warning for diverse ward', () => {
    const dossier = {
      ward: 'Test', ourParty: 'Reform UK',
      profile: { whiteBritishPct: 0.50 },
      election: { defender: { party: 'Labour' }, prediction: {} },
      talkingPoints: { local: [], council: [], national: [], constituency: [] },
    }
    const sheet = generateCheatSheet(dossier)
    expect(sheet.doNotSay.find(d => d.includes('immigration'))).toBeDefined()
  })

  it('adds do-not-say warning for affluent ward', () => {
    const dossier = {
      ward: 'Test', ourParty: 'Reform UK',
      profile: { deprivation: { decile: 9 } },
      election: { defender: { party: 'Labour' }, prediction: {} },
      talkingPoints: { local: [], council: [], national: [], constituency: [] },
    }
    const sheet = generateCheatSheet(dossier)
    expect(sheet.doNotSay.find(d => d.includes('Affluent ward'))).toBeDefined()
  })

  it('adds do-not-say warning for retired ward', () => {
    const dossier = {
      ward: 'Test', ourParty: 'Reform UK',
      profile: { over65Pct: 0.35 },
      election: { defender: { party: 'Labour' }, prediction: {} },
      talkingPoints: { local: [], council: [], national: [], constituency: [] },
    }
    const sheet = generateCheatSheet(dossier)
    expect(sheet.doNotSay.find(d => d.includes('Heavily retired'))).toBeDefined()
  })

  it('formats swing needed as percentage points', () => {
    const dossier = {
      ward: 'Test', ourParty: 'Reform UK', profile: {},
      election: { defender: { party: 'Labour' }, prediction: { swingRequired: 0.123 } },
      talkingPoints: { local: [], council: [], national: [], constituency: [] },
    }
    const sheet = generateCheatSheet(dossier)
    expect(sheet.swingNeeded).toBe('+12.3pp')
  })
})

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
