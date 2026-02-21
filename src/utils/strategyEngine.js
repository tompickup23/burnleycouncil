/**
 * strategyEngine.js — Ward strategy classification, talking points, and battleground ranking.
 *
 * Builds on electionModel.js predictions to provide:
 * 1. Ward classification (safe/hold/marginal/battleground/target/stretch)
 * 2. Swing-required calculations
 * 3. Auto-generated talking points from demographics/deprivation/spending
 * 4. Battleground ranking with multi-factor scoring
 * 5. Path-to-control analysis
 *
 * All functions are pure, unit-testable, and designed for the strategist role.
 */

// ---------------------------------------------------------------------------
// Ward Classification
// ---------------------------------------------------------------------------

/**
 * Classification thresholds (percentage point margins).
 * - safe:         >15pp majority, our party defending
 * - hold:         5-15pp majority, our party defending
 * - marginal:     2-5pp majority, either side
 * - battleground: <2pp majority, either side
 * - target:       opponent holds with <10pp — winnable
 * - stretch:      opponent holds with 10-20pp — ambitious
 * - write-off:    opponent holds with >20pp — resource sink
 */
export const WARD_CLASSES = {
  safe: { label: 'Safe', color: '#30d158', priority: 6 },
  hold: { label: 'Hold', color: '#34c759', priority: 5 },
  marginal_hold: { label: 'Marginal Hold', color: '#ffd60a', priority: 3 },
  battleground: { label: 'Battleground', color: '#ff9f0a', priority: 1 },
  target: { label: 'Target', color: '#0a84ff', priority: 2 },
  stretch: { label: 'Stretch', color: '#5e5ce6', priority: 4 },
  write_off: { label: 'Write-off', color: '#8e8e93', priority: 7 },
};

/**
 * Classify a ward from the perspective of a given party.
 * @param {Object} wardPrediction - Output from predictWard()
 * @param {string} ourParty - The party we're strategising for
 * @param {string|null} defender - Party currently defending this seat (or null)
 * @returns {{ classification: string, label: string, color: string, priority: number, majorityPct: number }}
 */
export function classifyWard(wardPrediction, ourParty, defender = null) {
  if (!wardPrediction?.prediction || !wardPrediction.winner) {
    return { classification: 'unknown', label: 'Unknown', color: '#8e8e93', priority: 99, majorityPct: 0 };
  }

  const { winner, majorityPct } = wardPrediction;
  const margin = Math.abs(majorityPct);
  const weWin = winner === ourParty;
  const weDefend = defender === ourParty;

  if (weWin && weDefend) {
    // We're defending and predicted to hold
    if (margin > 0.15) return { ...WARD_CLASSES.safe, classification: 'safe', majorityPct: margin };
    if (margin > 0.05) return { ...WARD_CLASSES.hold, classification: 'hold', majorityPct: margin };
    return { ...WARD_CLASSES.marginal_hold, classification: 'marginal_hold', majorityPct: margin };
  }

  if (weWin && !weDefend) {
    // We're gaining — opponent defends but we're predicted to win
    if (margin > 0.05) return { ...WARD_CLASSES.target, classification: 'target', majorityPct: margin };
    return { ...WARD_CLASSES.battleground, classification: 'battleground', majorityPct: margin };
  }

  if (!weWin && weDefend) {
    // We're losing a seat we currently hold
    if (margin < 0.02) return { ...WARD_CLASSES.battleground, classification: 'battleground', majorityPct: -margin };
    if (margin < 0.05) return { ...WARD_CLASSES.marginal_hold, classification: 'marginal_hold', majorityPct: -margin };
    return { ...WARD_CLASSES.target, classification: 'target', majorityPct: -margin };
  }

  // We neither win nor defend
  if (margin < 0.02) return { ...WARD_CLASSES.battleground, classification: 'battleground', majorityPct: -margin };
  if (margin < 0.10) return { ...WARD_CLASSES.target, classification: 'target', majorityPct: -margin };
  if (margin < 0.20) return { ...WARD_CLASSES.stretch, classification: 'stretch', majorityPct: -margin };
  return { ...WARD_CLASSES.write_off, classification: 'write_off', majorityPct: -margin };
}

// ---------------------------------------------------------------------------
// Swing Required
// ---------------------------------------------------------------------------

/**
 * Calculate the swing (in pp) required for a party to win a ward.
 * Swing = (winner's share - our share) / 2 (classic Butler swing).
 * @param {Object} wardPrediction - Output from predictWard()
 * @param {string} ourParty - The party we're calculating for
 * @returns {number} Swing in pp (positive = we need to gain, negative = we're ahead)
 */
export function calculateSwingRequired(wardPrediction, ourParty) {
  if (!wardPrediction?.prediction) return Infinity;

  const entries = Object.entries(wardPrediction.prediction);
  const ourEntry = entries.find(([party]) => party === ourParty);
  const ourPct = ourEntry?.[1]?.pct || 0;
  const winnerPct = entries[0]?.[1]?.pct || 0;
  const winnerParty = entries[0]?.[0];

  if (winnerParty === ourParty) return -(ourPct - (entries[1]?.[1]?.pct || 0)) / 2;
  return (winnerPct - ourPct) / 2;
}

// ---------------------------------------------------------------------------
// Talking Points Generator
// ---------------------------------------------------------------------------

/**
 * Generate auto-talking-points for a ward based on demographics, deprivation, turnout, and spending.
 * @param {Object} wardElection - Ward data from elections.json
 * @param {Object|null} demographics - Census 2021 ward data
 * @param {Object|null} deprivation - IMD 2019 ward data
 * @param {Object|null} wardPrediction - Output from predictWard()
 * @returns {Array<{ category: string, icon: string, priority: number, text: string }>}
 */
export function generateTalkingPoints(wardElection, demographics, deprivation, wardPrediction) {
  const points = [];

  // --- Demographics-based ---
  if (demographics) {
    const totalPop = demographics.age?.['Total: All usual residents'] || 0;

    // Over-65 concentration
    const over65 = (demographics.age?.['Aged 65 to 74 years'] || 0) +
                   (demographics.age?.['Aged 75 to 84 years'] || 0) +
                   (demographics.age?.['Aged 85 years and over'] || 0);
    const over65Pct = totalPop > 0 ? over65 / totalPop : 0;
    if (over65Pct > 0.25) {
      points.push({
        category: 'Demographics',
        icon: 'Users',
        priority: 1,
        text: `${Math.round(over65Pct * 100)}% over-65. Highlight: NHS waiting times, social care, pension triple lock, council tax discounts.`,
      });
    } else if (over65Pct > 0.18) {
      points.push({
        category: 'Demographics',
        icon: 'Users',
        priority: 3,
        text: `${Math.round(over65Pct * 100)}% over-65. Consider: pension issues, local health services, bus routes.`,
      });
    }

    // Young population (under 30)
    const under30 = (demographics.age?.['Aged 15 to 19 years'] || 0) +
                    (demographics.age?.['Aged 20 to 24 years'] || 0) +
                    (demographics.age?.['Aged 25 to 29 years'] || 0);
    const under30Pct = totalPop > 0 ? under30 / totalPop : 0;
    if (under30Pct > 0.20) {
      points.push({
        category: 'Demographics',
        icon: 'GraduationCap',
        priority: 3,
        text: `${Math.round(under30Pct * 100)}% aged 15-29. Highlight: housing affordability, jobs, apprenticeships, nightlife/culture.`,
      });
    }

    // Ethnic diversity
    const whiteBritish = demographics.ethnicity?.['White: English, Welsh, Scottish, Northern Irish or British'] || 0;
    const whiteBritishPct = totalPop > 0 ? whiteBritish / totalPop : 0;
    const diversityPct = 1 - whiteBritishPct;
    if (diversityPct > 0.30) {
      // Find top non-White group
      const ethnicGroups = Object.entries(demographics.ethnicity || {})
        .filter(([k]) => !k.includes('Total') && !k.includes('White: English'))
        .sort((a, b) => b[1] - a[1]);
      const topGroup = ethnicGroups[0]?.[0]?.replace(/:.*/g, '') || 'diverse';
      points.push({
        category: 'Demographics',
        icon: 'Globe',
        priority: 2,
        text: `${Math.round(diversityPct * 100)}% ethnic minority (largest: ${topGroup}). Community engagement essential — mosques, temples, cultural centres.`,
      });
    } else if (whiteBritishPct > 0.95) {
      points.push({
        category: 'Demographics',
        icon: 'Globe',
        priority: 4,
        text: `${Math.round(whiteBritishPct * 100)}% White British. Immigration and border security may resonate strongly.`,
      });
    }

    // Unemployment
    const econTotal = demographics.economic_activity?.['Total: All usual residents aged 16 years and over'] || 0;
    const unemployed = demographics.economic_activity?.['Unemployed'] ||
                       demographics.economic_activity?.['Economically active (excluding full-time students): Unemployed'] || 0;
    const unemploymentPct = econTotal > 0 ? unemployed / econTotal : 0;
    if (unemploymentPct > 0.06) {
      points.push({
        category: 'Economy',
        icon: 'Briefcase',
        priority: 1,
        text: `${(unemploymentPct * 100).toFixed(1)}% unemployment. Highlight: local jobs, business support, skills training, welfare reform.`,
      });
    }
  }

  // --- Deprivation-based ---
  if (deprivation) {
    const decile = deprivation.avg_imd_decile;
    if (decile != null && decile <= 2) {
      points.push({
        category: 'Deprivation',
        icon: 'TrendingDown',
        priority: 1,
        text: `Top 20% most deprived (IMD decile ${decile}). Key: cost of living, food banks, warm homes, anti-social behaviour, fly-tipping.`,
      });
    } else if (decile != null && decile >= 9) {
      points.push({
        category: 'Deprivation',
        icon: 'TrendingUp',
        priority: 3,
        text: `Affluent ward (IMD decile ${decile}). Key: council tax value for money, green spaces, planning decisions, school places.`,
      });
    }
  }

  // --- Turnout-based ---
  const latestElection = wardElection?.history?.[0];
  if (latestElection) {
    const turnout = latestElection.turnout;
    if (turnout != null && turnout < 0.25) {
      points.push({
        category: 'GOTV',
        icon: 'Target',
        priority: 1,
        text: `Very low turnout (${Math.round(turnout * 100)}%). GOTV is critical. Door-knock, postal vote forms, election day lifts.`,
      });
    } else if (turnout != null && turnout < 0.35) {
      points.push({
        category: 'GOTV',
        icon: 'Target',
        priority: 2,
        text: `Below-average turnout (${Math.round(turnout * 100)}%). Postal vote push and morning knock-up could swing this.`,
      });
    } else if (turnout != null && turnout > 0.50) {
      points.push({
        category: 'GOTV',
        icon: 'CheckCircle',
        priority: 4,
        text: `High turnout ward (${Math.round(turnout * 100)}%). Voters are engaged. Focus on persuasion over mobilisation.`,
      });
    }

    // Electorate size
    if (latestElection.electorate > 8000) {
      points.push({
        category: 'Resources',
        icon: 'MapPin',
        priority: 3,
        text: `Large ward (${latestElection.electorate.toLocaleString()} electors). Needs more leaflets, more canvassers, longer delivery walks.`,
      });
    }
  }

  // --- Competition-based ---
  if (wardPrediction?.prediction) {
    const entries = Object.entries(wardPrediction.prediction);
    if (entries.length >= 3) {
      const [, second] = entries[1] || [];
      const [, third] = entries[2] || [];
      if (second && third && Math.abs((second.pct || 0) - (third.pct || 0)) < 0.03) {
        points.push({
          category: 'Competition',
          icon: 'Swords',
          priority: 2,
          text: `Three-way marginal — 2nd and 3rd place within 3pp. Vote splitting could decide outcome.`,
        });
      }
    }
  }

  return points.sort((a, b) => a.priority - b.priority);
}

// ---------------------------------------------------------------------------
// Battleground Ranking
// ---------------------------------------------------------------------------

/**
 * Score and rank wards by strategic priority for a given party.
 *
 * Scoring formula (0-100):
 * - Win probability (40%): Inverse of swing required, normalised
 * - Efficiency (25%): Small electorate = fewer resources needed per vote
 * - Turnout opportunity (20%): Low turnout = GOTV upside
 * - Defending bonus (15%): Holding a seat is worth more than gaining one
 *
 * @param {Array<string>} wardsUp - Ward names up for election
 * @param {Object} councilPrediction - Output from predictCouncil()
 * @param {Object} electionsData - Full elections.json
 * @param {string} ourParty - The party we're strategising for
 * @param {Object|null} demographicsMap - Ward code/name → demographics
 * @param {Object|null} deprivationMap - Ward name → deprivation
 * @returns {Array<Object>} Ranked wards with scores and classification
 */
export function rankBattlegrounds(wardsUp, councilPrediction, electionsData, ourParty, demographicsMap, deprivationMap) {
  if (!wardsUp?.length || !councilPrediction?.wards) return [];

  const defenders = electionsData?.next_election?.defenders || {};
  const results = [];

  for (const wardName of wardsUp) {
    const pred = councilPrediction.wards[wardName];
    if (!pred?.prediction) continue;

    const wardData = electionsData.wards?.[wardName];
    const defender = defenders[wardName]?.party || null;
    const classification = classifyWard(pred, ourParty, defender);
    const swingReq = calculateSwingRequired(pred, ourParty);

    // Demographics lookup — try by ward name in deprivation map
    const demo = demographicsMap ? findDemographics(demographicsMap, wardName) : null;
    const deprivation = deprivationMap?.[wardName] || null;

    // Win probability: sigmoid of negative swing (if we need -3pp swing = 73% prob, +10pp = 4%)
    const winProb = 1 / (1 + Math.exp(swingReq * 15));

    // Efficiency: smaller electorate = easier to canvass
    const electorate = wardData?.history?.[0]?.electorate || 5000;
    const efficiencyScore = Math.max(0, 1 - (electorate / 15000));

    // Turnout opportunity: lower turnout = more GOTV upside
    const turnout = wardData?.history?.[0]?.turnout || 0.30;
    const turnoutOpp = Math.max(0, 1 - turnout);

    // Defending bonus
    const defendingBonus = defender === ourParty ? 1 : 0;

    // Composite score (0-100)
    const score = Math.round(
      (winProb * 40) +
      (efficiencyScore * 25) +
      (turnoutOpp * 20) +
      (defendingBonus * 15)
    );

    const talkingPoints = generateTalkingPoints(wardData, demo, deprivation, pred);

    results.push({
      ward: wardName,
      classification: classification.classification,
      classLabel: classification.label,
      classColor: classification.color,
      winner: pred.winner,
      ourPct: pred.prediction[ourParty]?.pct || 0,
      winnerPct: Object.values(pred.prediction)[0]?.pct || 0,
      majorityPct: classification.majorityPct,
      swingRequired: Math.round(swingReq * 1000) / 1000,
      winProbability: Math.round(winProb * 100) / 100,
      electorate,
      turnout,
      defender,
      confidence: pred.confidence,
      score,
      talkingPoints,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Find demographics data for a ward. Demographics are keyed by ward code,
 * so we search by name match.
 */
function findDemographics(demographicsMap, wardName) {
  if (!demographicsMap) return null;
  // Direct key match (some maps use ward name)
  if (demographicsMap[wardName]) return demographicsMap[wardName];
  // Search by name field in ward-code-keyed object
  for (const val of Object.values(demographicsMap)) {
    if (val?.name === wardName || val?.ward_name === wardName) return val;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Path to Control
// ---------------------------------------------------------------------------

/**
 * Calculate the path to council control for a given party.
 * Shows how many of the top-ranked battlegrounds must be won.
 *
 * @param {Array<Object>} rankedWards - Output from rankBattlegrounds()
 * @param {Object} currentSeatTotals - Current seat distribution
 * @param {number} totalSeats - Total seats on council
 * @param {string} ourParty - The party we're strategising for
 * @returns {{ seatsNeeded: number, currentSeats: number, majorityThreshold: number,
 *             scenarios: Array<{ wardsWon: number, probability: number, seats: number, enough: boolean }>,
 *             topTargets: Array<Object> }}
 */
export function calculatePathToControl(rankedWards, currentSeatTotals, totalSeats, ourParty) {
  const majorityThreshold = Math.floor(totalSeats / 2) + 1;
  const currentSeats = currentSeatTotals[ourParty] || 0;
  const seatsNeeded = Math.max(0, majorityThreshold - currentSeats);

  // Count seats NOT up for election (retained automatically)
  const wardsUpParties = rankedWards.reduce((acc, w) => {
    if (w.defender === ourParty) acc.defending++;
    return acc;
  }, { defending: 0 });

  // Filter to actionable wards (not write-offs)
  const actionable = rankedWards.filter(w =>
    w.classification !== 'write_off' && w.classification !== 'safe'
  );

  // Scenario analysis: what if we win top N battlegrounds?
  const scenarios = [];
  let cumulativeProb = 1;
  let cumulativeSeats = currentSeats;
  // Subtract defending seats (they're counted in currentSeats via holders not up)
  // Actually the rankedWards only covers wards UP, so we need seats NOT up
  // currentSeatTotals already includes non-up seats

  // For wards we defend that are up: we lose them unless we win
  // For wards we're targeting: we gain them if we win
  // Start from currentSeats minus defending seats that are up (they'll be re-won or lost)
  const defendingUp = rankedWards.filter(w => w.defender === ourParty);
  const baseSeats = currentSeats - defendingUp.length;

  // Re-add defending seats we're predicted to hold, then add targets
  const sortedActionable = [...rankedWards].sort((a, b) => b.winProbability - a.winProbability);
  let runningSeats = baseSeats;
  let runningProb = 1;

  for (let i = 0; i < Math.min(sortedActionable.length, 20); i++) {
    const ward = sortedActionable[i];
    const weWinThis = ward.winner === ourParty || ward.swingRequired <= 0;
    if (weWinThis) {
      runningSeats++;
      runningProb *= ward.winProbability;
    }

    if ((i + 1) % 3 === 0 || i === sortedActionable.length - 1 || runningSeats >= majorityThreshold) {
      scenarios.push({
        wardsWon: i + 1,
        probability: Math.round(runningProb * 100) / 100,
        seats: runningSeats,
        enough: runningSeats >= majorityThreshold,
      });
      if (runningSeats >= majorityThreshold) break;
    }
  }

  // Top targets: wards with best score that we don't currently hold
  const topTargets = rankedWards
    .filter(w => w.defender !== ourParty && w.classification !== 'write_off')
    .slice(0, 10);

  // Vulnerable: wards we defend but might lose
  const vulnerable = rankedWards
    .filter(w => w.defender === ourParty && w.winner !== ourParty)
    .sort((a, b) => a.winProbability - b.winProbability);

  return {
    seatsNeeded,
    currentSeats,
    majorityThreshold,
    totalSeats,
    scenarios,
    topTargets,
    vulnerable,
    defendingCount: defendingUp.length,
  };
}

// ---------------------------------------------------------------------------
// Ward Archetype Classification
// ---------------------------------------------------------------------------

/**
 * Classify a ward into one of 8 archetypes based on demographics and deprivation.
 * Used for segmenting campaign messaging.
 *
 * @param {Object|null} demographics - Census 2021 ward data
 * @param {Object|null} deprivation - IMD 2019 ward data
 * @returns {{ archetype: string, label: string, description: string }}
 */
export function classifyWardArchetype(demographics, deprivation) {
  if (!demographics && !deprivation) {
    return { archetype: 'unknown', label: 'Unknown', description: 'No data available' };
  }

  const totalPop = demographics?.age?.['Total: All usual residents'] || 0;
  const decile = deprivation?.avg_imd_decile ?? 5;

  // Calculate key ratios
  const over65 = totalPop > 0
    ? ((demographics?.age?.['Aged 65 to 74 years'] || 0) +
       (demographics?.age?.['Aged 75 to 84 years'] || 0) +
       (demographics?.age?.['Aged 85 years and over'] || 0)) / totalPop
    : 0;

  const whiteBritish = totalPop > 0
    ? (demographics?.ethnicity?.['White: English, Welsh, Scottish, Northern Irish or British'] || 0) / totalPop
    : 0;

  const econTotal = demographics?.economic_activity?.['Total: All usual residents aged 16 years and over'] || 0;
  const unemployed = (demographics?.economic_activity?.['Unemployed'] ||
                      demographics?.economic_activity?.['Economically active (excluding full-time students): Unemployed'] || 0);
  const unemploymentPct = econTotal > 0 ? unemployed / econTotal : 0;

  // Classification logic
  if (decile <= 2 && whiteBritish > 0.80) {
    return {
      archetype: 'deprived_white',
      label: 'Left Behind',
      description: 'High deprivation, predominantly White British. Cost of living, immigration, and local services are top concerns.',
    };
  }

  if (decile <= 2 && whiteBritish <= 0.80) {
    return {
      archetype: 'deprived_diverse',
      label: 'Urban Diverse',
      description: 'High deprivation, ethnically diverse. Community cohesion, employment, and housing are key.',
    };
  }

  if (decile >= 8 && over65 > 0.22) {
    return {
      archetype: 'affluent_retired',
      label: 'Affluent Retired',
      description: 'Low deprivation, older population. Council tax value, green spaces, and heritage matter most.',
    };
  }

  if (decile >= 8 && over65 <= 0.22) {
    return {
      archetype: 'affluent_family',
      label: 'Affluent Families',
      description: 'Low deprivation, working-age. Schools, planning, roads, and property values are priorities.',
    };
  }

  if (over65 > 0.28) {
    return {
      archetype: 'retirement',
      label: 'Retirement Ward',
      description: 'Very high over-65 population. Health, social care, transport links, and loneliness are concerns.',
    };
  }

  if (unemploymentPct > 0.08) {
    return {
      archetype: 'struggling',
      label: 'Struggling',
      description: 'High unemployment. Jobs, skills, welfare reform, and anti-social behaviour are priorities.',
    };
  }

  if (decile >= 4 && decile <= 7) {
    return {
      archetype: 'middle_ground',
      label: 'Middle Ground',
      description: 'Average deprivation. Broad appeal needed: bins, roads, council tax, local investment.',
    };
  }

  return {
    archetype: 'mixed',
    label: 'Mixed',
    description: 'No dominant demographic pattern. Standard broad-appeal messaging recommended.',
  };
}

// ---------------------------------------------------------------------------
// Summary Statistics
// ---------------------------------------------------------------------------

/**
 * Generate a strategy summary for the whole council.
 * @param {Array<Object>} rankedWards - Output from rankBattlegrounds()
 * @param {string} ourParty - The party we're strategising for
 * @returns {{ byClassification: Object, avgScore: number, topOpportunities: number, vulnerableSeats: number }}
 */
export function generateStrategySummary(rankedWards, ourParty) {
  const byClassification = {};
  let totalScore = 0;
  let topOpportunities = 0;
  let vulnerableSeats = 0;

  for (const ward of rankedWards) {
    byClassification[ward.classification] = (byClassification[ward.classification] || 0) + 1;
    totalScore += ward.score;

    if (ward.defender !== ourParty && ward.winProbability > 0.40) {
      topOpportunities++;
    }
    if (ward.defender === ourParty && ward.winner !== ourParty) {
      vulnerableSeats++;
    }
  }

  return {
    byClassification,
    avgScore: rankedWards.length > 0 ? Math.round(totalScore / rankedWards.length) : 0,
    topOpportunities,
    vulnerableSeats,
    totalWards: rankedWards.length,
  };
}

// ---------------------------------------------------------------------------
// Historical Swing Analysis
// ---------------------------------------------------------------------------

/**
 * Calculate party-to-party swing between two consecutive elections for a ward.
 * Butler swing: (Party A gain + Party B loss) / 2
 * @param {Object} election1 - Earlier election result
 * @param {Object} election2 - Later election result
 * @param {string} partyA - First party
 * @param {string} partyB - Second party
 * @returns {number} Swing in pp (positive = towards partyA)
 */
export function calculateSwingBetween(election1, election2, partyA, partyB) {
  if (!election1?.candidates || !election2?.candidates) return 0;

  const getPartyPct = (election, party) => {
    const c = election.candidates.find(c => c.party === party);
    return c?.pct || 0;
  };

  const aGain = getPartyPct(election2, partyA) - getPartyPct(election1, partyA);
  const bLoss = getPartyPct(election1, partyB) - getPartyPct(election2, partyB);
  return (aGain + bLoss) / 2;
}

/**
 * Compute full swing history for a ward across all elections.
 * Returns swing between each consecutive pair of elections,
 * plus trend analysis (accelerating/decelerating/stable).
 *
 * @param {Object} wardData - Ward from elections.json
 * @param {string} ourParty - Party to calculate swings for
 * @returns {{ swings: Array<{ year: number, date: string, ourPct: number, winnerParty: string, winnerPct: number, margin: number, turnout: number }>, trend: string, avgSwing: number, volatility: number }}
 */
export function calculateSwingHistory(wardData, ourParty) {
  if (!wardData?.history?.length) {
    return { swings: [], trend: 'unknown', avgSwing: 0, volatility: 0 };
  }

  // Sort history oldest→newest
  const sorted = [...wardData.history]
    .filter(e => e.candidates?.length > 0)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const swings = sorted.map(election => {
    const ourCandidate = election.candidates.find(c => c.party === ourParty);
    const ourPct = ourCandidate?.pct || 0;
    const winner = election.candidates.reduce((best, c) =>
      (c.pct || 0) > (best?.pct || 0) ? c : best, election.candidates[0]);

    return {
      year: election.year,
      date: election.date,
      ourPct,
      winnerParty: winner?.party || 'Unknown',
      winnerPct: winner?.pct || 0,
      margin: ourPct - (winner?.party === ourParty ? (election.candidates
        .filter(c => c.party !== ourParty)
        .sort((a, b) => (b.pct || 0) - (a.pct || 0))[0]?.pct || 0) : (winner?.pct || 0)),
      turnout: election.turnout || 0,
      electorate: election.electorate || 0,
    };
  });

  // Calculate trend from vote share changes
  if (swings.length < 2) {
    return { swings, trend: 'insufficient', avgSwing: 0, volatility: 0 };
  }

  const changes = [];
  for (let i = 1; i < swings.length; i++) {
    changes.push(swings[i].ourPct - swings[i - 1].ourPct);
  }

  const avgSwing = changes.reduce((s, v) => s + v, 0) / changes.length;
  const variance = changes.reduce((s, v) => s + (v - avgSwing) ** 2, 0) / changes.length;
  const volatility = Math.sqrt(variance);

  // Trend: look at recent 3 changes vs overall
  let trend = 'stable';
  if (changes.length >= 2) {
    const recentChanges = changes.slice(-Math.min(3, changes.length));
    const recentAvg = recentChanges.reduce((s, v) => s + v, 0) / recentChanges.length;
    if (recentAvg > 0.02) trend = 'improving';
    else if (recentAvg < -0.02) trend = 'declining';
    else if (volatility > 0.08) trend = 'volatile';
  }

  return {
    swings,
    trend,
    avgSwing: Math.round(avgSwing * 1000) / 1000,
    volatility: Math.round(volatility * 1000) / 1000,
  };
}

// ---------------------------------------------------------------------------
// Resource Allocation Model
// ---------------------------------------------------------------------------

/**
 * Campaign resource allocation model.
 * Estimates optimal distribution of campaign hours across wards based on:
 * - Battleground score (priority)
 * - Electorate size (effort required)
 * - Win probability (diminishing returns)
 * - Turnout opportunity (GOTV potential)
 *
 * @param {Array<Object>} rankedWards - Output from rankBattlegrounds()
 * @param {number} totalHours - Total campaign hours available (default: 1000)
 * @returns {Array<{ ward: string, hours: number, pctOfTotal: number, costPerVote: number, roi: string, classification: string }>}
 */
export function allocateResources(rankedWards, totalHours = 1000) {
  if (!rankedWards?.length) return [];

  // Step 1: Calculate raw priority weights
  // Higher score → more resources, but write-offs get near-zero
  const weighted = rankedWards.map(ward => {
    const classMultiplier = {
      safe: 0.2,         // Don't over-invest in safe seats
      hold: 0.6,         // Moderate attention
      marginal_hold: 1.2, // High priority — defend closely
      battleground: 1.5,  // Top priority
      target: 1.3,        // High priority — gain
      stretch: 0.4,       // Low investment
      write_off: 0.05,    // Token presence only
    }[ward.classification] || 0.5;

    // Diminishing returns: wards with very high win prob need less investment
    const urgencyFactor = ward.winProbability > 0.7 ? 0.6 :
                          ward.winProbability > 0.5 ? 0.8 :
                          ward.winProbability > 0.3 ? 1.0 :
                          ward.winProbability > 0.1 ? 0.7 : 0.3;

    // Electorate scaling: larger wards need proportionally more resources
    const sizeScale = Math.sqrt(ward.electorate / 5000);

    const rawWeight = ward.score * classMultiplier * urgencyFactor * sizeScale;
    return { ward, rawWeight };
  });

  // Step 2: Normalise and distribute hours
  const totalWeight = weighted.reduce((s, w) => s + w.rawWeight, 0);
  if (totalWeight === 0) return [];

  return weighted.map(({ ward, rawWeight }) => {
    const pctOfTotal = rawWeight / totalWeight;
    const hours = Math.round(totalHours * pctOfTotal);

    // Estimate cost-per-incremental-vote
    // Assume 1 hour of campaigning = 8 voter contacts, 15% persuasion rate
    const contactsPerHour = 8;
    const persuasionRate = 0.15;
    const incrementalVotes = hours * contactsPerHour * persuasionRate;
    const electorate = ward.electorate || 5000;
    const estimatedTurnout = ward.turnout || 0.30;
    const totalVoters = Math.round(electorate * estimatedTurnout);
    const costPerVote = incrementalVotes > 0 ? hours / incrementalVotes : Infinity;

    // ROI classification
    let roi = 'low';
    if (ward.winProbability > 0.3 && ward.winProbability < 0.7 && costPerVote < 2) roi = 'high';
    else if (ward.winProbability > 0.2 && costPerVote < 4) roi = 'medium';

    return {
      ward: ward.ward,
      classification: ward.classification,
      classLabel: ward.classLabel,
      score: ward.score,
      hours,
      pctOfTotal: Math.round(pctOfTotal * 1000) / 10,
      electorate: ward.electorate,
      winProbability: ward.winProbability,
      incrementalVotes: Math.round(incrementalVotes),
      costPerVote: Math.round(costPerVote * 10) / 10,
      roi,
    };
  }).sort((a, b) => b.hours - a.hours);
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

/**
 * Generate CSV content from strategy data for campaign teams.
 * Includes: ward rankings, classifications, predictions, talking points, resource allocation.
 *
 * @param {Array<Object>} rankedWards - Output from rankBattlegrounds()
 * @param {Array<Object>|null} resourceAllocation - Output from allocateResources()
 * @param {string} ourParty - Selected party
 * @param {string} councilName - Council name for header
 * @returns {string} CSV content
 */
export function generateStrategyCSV(rankedWards, resourceAllocation, ourParty, councilName) {
  if (!rankedWards?.length) return '';

  const resourceMap = {};
  if (resourceAllocation) {
    for (const r of resourceAllocation) resourceMap[r.ward] = r;
  }

  const headers = [
    'Rank', 'Ward', 'Classification', 'Predicted Winner', 'Our Vote Share (%)',
    'Swing Required (pp)', 'Win Probability (%)', 'Turnout (%)', 'Electorate',
    'Priority Score', 'Defender', 'Confidence',
    'Allocated Hours', 'ROI', 'Top Talking Points',
  ];

  const rows = rankedWards.map((ward, i) => {
    const res = resourceMap[ward.ward];
    const tps = ward.talkingPoints.slice(0, 3).map(tp => `${tp.category}: ${tp.text}`).join(' | ');

    return [
      i + 1,
      `"${ward.ward}"`,
      ward.classLabel,
      ward.winner,
      (ward.ourPct * 100).toFixed(1),
      (ward.swingRequired * 100).toFixed(1),
      Math.round(ward.winProbability * 100),
      Math.round(ward.turnout * 100),
      ward.electorate,
      ward.score,
      ward.defender || 'N/A',
      ward.confidence,
      res?.hours || 0,
      res?.roi || 'N/A',
      `"${tps}"`,
    ].join(',');
  });

  const meta = [
    `# ${councilName} — Strategy Export for ${ourParty}`,
    `# Generated: ${new Date().toISOString().split('T')[0]}`,
    `# Wards: ${rankedWards.length}`,
    '',
  ];

  return meta.join('\n') + headers.join(',') + '\n' + rows.join('\n');
}
