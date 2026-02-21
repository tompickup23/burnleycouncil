import { describe, it, expect } from 'vitest'
import {
  classifyWard,
  calculateSwingRequired,
  generateTalkingPoints,
  rankBattlegrounds,
  calculatePathToControl,
  classifyWardArchetype,
  generateStrategySummary,
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
