/**
 * electionModel.js — Pure election prediction engine for AI DOGE
 *
 * Composite Ward-Level Prediction Model:
 * 1. Baseline: Most recent same-type election result
 * 2. National Swing: Polling delta dampened for local elections
 * 3. Demographics: Small adjustments from deprivation/age/ethnicity
 * 4. Incumbency: Bonus for sitting councillor's party
 * 5. New Party Entry: Reform UK proxy from GE2024 + LCC 2025
 * 6. Normalise + Vote Estimation
 *
 * All functions are pure (no side effects), unit-testable, and
 * return methodology arrays showing transparent workings.
 */

// ---------------------------------------------------------------------------
// Default assumptions (user can override via UI sliders)
// ---------------------------------------------------------------------------

export const DEFAULT_ASSUMPTIONS = {
  nationalToLocalDampening: 0.65,
  incumbencyBonusPct: 0.05,
  retirementPenaltyPct: -0.02,
  reformProxyWeights: { ge: 0.4, lcc: 0.6 },
  turnoutAdjustment: 0,        // user can adjust ±5pp
  swingMultiplier: 1.0,         // user can scale swing 0.5× to 1.5×
  reformStandsInAllWards: true, // toggle: Reform stands everywhere
};

// ---------------------------------------------------------------------------
// Core prediction functions
// ---------------------------------------------------------------------------

/**
 * Get the baseline vote shares from the most recent election in this ward.
 * @param {Object} wardData - Ward object from elections.json
 * @param {string} electionType - 'borough' or 'county'
 * @returns {{ parties: Object<string, number>, date: string, year: number } | null}
 */
export function getBaseline(wardData, electionType = 'borough') {
  if (!wardData?.history?.length) return null;

  // Find most recent election of the right type (or any if no match)
  const matching = wardData.history
    .filter(e => !electionType || e.type?.includes(electionType))
    .sort((a, b) => b.date.localeCompare(a.date));

  const election = matching[0] || wardData.history[wardData.history.length - 1];
  if (!election?.candidates?.length) return null;

  const parties = {};
  for (const c of election.candidates) {
    // Take the best candidate per party
    if (!parties[c.party] || c.pct > parties[c.party]) {
      parties[c.party] = c.pct || (c.votes / (election.turnout_votes || 1));
    }
  }

  return {
    parties,
    date: election.date,
    year: election.year,
    turnout: election.turnout,
    turnoutVotes: election.turnout_votes,
    electorate: election.electorate,
  };
}

/**
 * Calculate national swing adjustments.
 * @param {Object} baseline - Party vote shares from baseline
 * @param {Object} nationalPolling - Current national polling averages
 * @param {Object} ge2024Result - GE2024 national result
 * @param {Object} assumptions - Model assumptions
 * @returns {{ adjustments: Object<string, number>, methodology: Object }}
 */
export function calculateNationalSwing(baseline, nationalPolling, ge2024Result, assumptions) {
  const adjustments = {};
  const details = {};
  const dampening = assumptions.nationalToLocalDampening || 0.65;
  const multiplier = assumptions.swingMultiplier || 1.0;

  for (const party of Object.keys(baseline)) {
    const currentNational = nationalPolling[party] || 0;
    const ge2024National = ge2024Result[party] || 0;
    const nationalSwing = currentNational - ge2024National;
    const localSwing = nationalSwing * dampening * multiplier;

    adjustments[party] = localSwing;
    details[party] = {
      nationalNow: currentNational,
      nationalGE2024: ge2024National,
      nationalSwing: Math.round(nationalSwing * 1000) / 1000,
      dampened: Math.round(localSwing * 1000) / 1000,
    };
  }

  return {
    adjustments,
    methodology: {
      step: 2,
      name: 'National Swing',
      description: `Polling change since GE2024, dampened by ${dampening} for local elections` +
        (multiplier !== 1.0 ? ` (×${multiplier} user adjustment)` : ''),
      details,
    },
  };
}

/**
 * Calculate demographic adjustments based on ward characteristics.
 * @param {Object} demographics - Ward demographics from demographics.json
 * @param {Object} deprivation - Ward deprivation from deprivation.json
 * @param {Object} params - Demographic adjustment parameters
 * @returns {{ adjustments: Object<string, number>, methodology: Object }}
 */
export function calculateDemographicAdjustments(demographics, deprivation, params) {
  const adjustments = {};
  const factors = [];

  if (!params) params = DEFAULT_ASSUMPTIONS;
  const demoParams = params.demographicAdjustments || {
    high_deprivation_labour_bonus: 0.02,
    high_deprivation_conservative_penalty: -0.02,
    over65_conservative_bonus: 0.015,
    over65_reform_bonus: 0.01,
    asian_heritage_independent_bonus: 0.02,
    rural_conservative_bonus: 0.01,
  };

  // Deprivation: IMD decile 1-2 = very deprived
  if (deprivation?.avg_imd_decile && deprivation.avg_imd_decile <= 2) {
    adjustments['Labour'] = (adjustments['Labour'] || 0) + demoParams.high_deprivation_labour_bonus;
    adjustments['Conservative'] = (adjustments['Conservative'] || 0) + demoParams.high_deprivation_conservative_penalty;
    factors.push(`High deprivation (decile ${deprivation.avg_imd_decile}): Labour +${(demoParams.high_deprivation_labour_bonus * 100).toFixed(0)}pp, Conservative ${(demoParams.high_deprivation_conservative_penalty * 100).toFixed(0)}pp`);
  }

  // Over-65 proportion
  if (demographics?.age_65_plus_pct && demographics.age_65_plus_pct > 0.25) {
    adjustments['Conservative'] = (adjustments['Conservative'] || 0) + demoParams.over65_conservative_bonus;
    adjustments['Reform UK'] = (adjustments['Reform UK'] || 0) + demoParams.over65_reform_bonus;
    factors.push(`High over-65 (${(demographics.age_65_plus_pct * 100).toFixed(0)}%): Conservative +${(demoParams.over65_conservative_bonus * 100).toFixed(1)}pp, Reform +${(demoParams.over65_reform_bonus * 100).toFixed(0)}pp`);
  }

  // Asian heritage > 20% (East Lancashire specific)
  if (demographics?.asian_pct && demographics.asian_pct > 0.20) {
    adjustments['Independent'] = (adjustments['Independent'] || 0) + demoParams.asian_heritage_independent_bonus;
    factors.push(`High Asian heritage (${(demographics.asian_pct * 100).toFixed(0)}%): Independent +${(demoParams.asian_heritage_independent_bonus * 100).toFixed(0)}pp`);
  }

  return {
    adjustments,
    methodology: {
      step: 3,
      name: 'Demographics',
      description: factors.length > 0
        ? `${factors.length} demographic factor(s) applied`
        : 'No significant demographic adjustments for this ward',
      factors,
    },
  };
}

/**
 * Calculate incumbency adjustment.
 * @param {Object} wardData - Ward object with current_holders
 * @param {Object} assumptions - Model assumptions
 * @returns {{ adjustments: Object<string, number>, methodology: Object }}
 */
export function calculateIncumbencyAdjustment(wardData, assumptions) {
  const adjustments = {};
  const factors = [];

  if (!wardData?.current_holders?.length) {
    return {
      adjustments,
      methodology: {
        step: 4, name: 'Incumbency',
        description: 'No current holder data available',
        factors: [],
      },
    };
  }

  // Find the holder whose seat is up (most recently elected in the last cycle)
  const holders = wardData.current_holders;
  // For simplicity, assume the holder standing down = no bonus
  // Incumbent re-standing = bonus
  const incumbentParty = holders[0]?.party;
  if (incumbentParty) {
    const bonus = assumptions.incumbencyBonusPct || 0.05;
    adjustments[incumbentParty] = bonus;
    factors.push(`Incumbent party (${incumbentParty}): +${(bonus * 100).toFixed(0)}pp incumbency bonus`);
  }

  return {
    adjustments,
    methodology: {
      step: 4,
      name: 'Incumbency',
      description: factors.length > 0 ? factors.join('; ') : 'No incumbency adjustment',
      factors,
    },
  };
}

/**
 * Handle Reform UK entry into wards where they haven't stood before.
 * Uses GE2024 and LCC 2025 results as proxy.
 * @param {Object} baseline - Current party baselines
 * @param {Object} constituencyResult - GE2024 constituency results
 * @param {Object} lcc2025 - LCC 2025 reference data
 * @param {Object} assumptions
 * @returns {{ adjustments: Object<string, number>, reformEstimate: number, methodology: Object }}
 */
export function calculateReformEntry(baseline, constituencyResult, lcc2025, assumptions) {
  const adjustments = {};
  let reformEstimate = 0;
  const factors = [];

  // If Reform already has a baseline, no entry calculation needed
  if (baseline['Reform UK'] && baseline['Reform UK'] > 0.01) {
    return {
      adjustments,
      reformEstimate: baseline['Reform UK'],
      methodology: {
        step: 5, name: 'New Party Entry',
        description: 'Reform UK has existing baseline — no proxy needed',
        factors: [],
      },
    };
  }

  if (!assumptions.reformStandsInAllWards) {
    return {
      adjustments,
      reformEstimate: 0,
      methodology: {
        step: 5, name: 'New Party Entry',
        description: 'Reform UK not standing in this ward (user setting)',
        factors: [],
      },
    };
  }

  const weights = assumptions.reformProxyWeights || { ge: 0.4, lcc: 0.6 };

  // GE2024 Reform result for this constituency
  const geReform = constituencyResult?.['Reform UK'] || 0;
  // LCC 2025 overall Reform result
  const lccReform = lcc2025?.results?.['Reform UK']?.pct || 0;

  reformEstimate = (geReform * weights.ge + lccReform * weights.lcc) * 0.85;
  // 0.85 factor: borough elections typically see lower Reform vote than national/county

  if (reformEstimate > 0.01) {
    adjustments['Reform UK'] = reformEstimate;
    // Other parties lose proportionally
    const totalOther = Object.values(baseline).reduce((s, v) => s + v, 0);
    if (totalOther > 0) {
      for (const party of Object.keys(baseline)) {
        const share = baseline[party] / totalOther;
        adjustments[party] = (adjustments[party] || 0) - (reformEstimate * share);
      }
    }
    factors.push(
      `Reform proxy: GE2024 ${(geReform * 100).toFixed(1)}% × ${weights.ge} + LCC2025 ${(lccReform * 100).toFixed(1)}% × ${weights.lcc} = ${(reformEstimate * 100).toFixed(1)}%`
    );
  }

  return {
    adjustments,
    reformEstimate,
    methodology: {
      step: 5,
      name: 'New Party Entry',
      description: factors.length > 0
        ? `Reform UK estimated at ${(reformEstimate * 100).toFixed(1)}% from GE/LCC proxy`
        : 'No new party entry adjustment',
      factors,
    },
  };
}

/**
 * Normalise party shares to sum to 1.0.
 * @param {Object} shares - Party → share mapping
 * @returns {Object} Normalised shares
 */
export function normaliseShares(shares) {
  const total = Object.values(shares).reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return shares;
  const result = {};
  for (const [party, share] of Object.entries(shares)) {
    result[party] = Math.max(0, share) / total;
  }
  return result;
}

/**
 * Predict a single ward's election outcome.
 * @param {Object} wardData - Ward from elections.json
 * @param {Object} assumptions - User-adjustable assumptions
 * @param {Object} nationalPolling - Current polling averages
 * @param {Object} ge2024Result - GE2024 national result
 * @param {Object} demographics - Ward demographics
 * @param {Object} deprivation - Ward deprivation data
 * @param {Object} constituencyResult - GE2024 constituency result for this ward
 * @param {Object} lcc2025 - LCC 2025 reference data
 * @param {Object} modelParams - Model parameter config
 * @returns {{ prediction: Object, methodology: Array, confidence: string }}
 */
export function predictWard(
  wardData,
  assumptions = DEFAULT_ASSUMPTIONS,
  nationalPolling = {},
  ge2024Result = {},
  demographics = null,
  deprivation = null,
  constituencyResult = null,
  lcc2025 = null,
  modelParams = null,
) {
  const methodology = [];

  // Step 1: Baseline
  const baseline = getBaseline(wardData, 'borough');
  if (!baseline) {
    return {
      prediction: null,
      methodology: [{ step: 1, name: 'Baseline', description: 'No historical election data for this ward' }],
      confidence: 'none',
    };
  }

  methodology.push({
    step: 1,
    name: 'Baseline',
    description: `Most recent borough result (${baseline.date})`,
    data: { ...baseline.parties },
  });

  // Start with baseline shares
  let shares = { ...baseline.parties };

  // Step 2: National Swing
  const swing = calculateNationalSwing(baseline.parties, nationalPolling, ge2024Result, assumptions);
  methodology.push(swing.methodology);
  for (const [party, adj] of Object.entries(swing.adjustments)) {
    shares[party] = (shares[party] || 0) + adj;
  }

  // Step 3: Demographics
  const demo = calculateDemographicAdjustments(demographics, deprivation, modelParams);
  methodology.push(demo.methodology);
  for (const [party, adj] of Object.entries(demo.adjustments)) {
    shares[party] = (shares[party] || 0) + adj;
  }

  // Step 4: Incumbency
  const incumb = calculateIncumbencyAdjustment(wardData, assumptions);
  methodology.push(incumb.methodology);
  for (const [party, adj] of Object.entries(incumb.adjustments)) {
    shares[party] = (shares[party] || 0) + adj;
  }

  // Step 5: Reform UK entry
  const reform = calculateReformEntry(baseline.parties, constituencyResult, lcc2025, assumptions);
  methodology.push(reform.methodology);
  for (const [party, adj] of Object.entries(reform.adjustments)) {
    shares[party] = (shares[party] || 0) + adj;
  }

  // Step 6: Normalise
  const normalised = normaliseShares(shares);
  methodology.push({
    step: 6,
    name: 'Normalise',
    description: 'All shares scaled to sum to 100%',
    data: Object.fromEntries(
      Object.entries(normalised).map(([p, v]) => [p, Math.round(v * 1000) / 1000])
    ),
  });

  // Estimate votes
  const turnout = Math.max(0.15, Math.min(0.65,
    (baseline.turnout || 0.30) + (assumptions.turnoutAdjustment || 0)
  ));
  const electorate = baseline.electorate || baseline.turnoutVotes / (baseline.turnout || 0.30);
  const totalVotes = Math.round(electorate * turnout);

  const prediction = {};
  for (const [party, share] of Object.entries(normalised)) {
    prediction[party] = {
      pct: Math.round(share * 1000) / 1000,
      votes: Math.round(share * totalVotes),
    };
  }

  // Sort by votes descending
  const sorted = Object.entries(prediction)
    .sort((a, b) => b[1].votes - a[1].votes);

  const winner = sorted[0]?.[0];
  const runnerUp = sorted[1]?.[0];
  const majority = winner && runnerUp
    ? prediction[winner].votes - prediction[runnerUp].votes
    : 0;

  // Confidence based on majority size
  const majorityPct = totalVotes > 0 ? majority / totalVotes : 0;
  let confidence = 'low';
  if (majorityPct > 0.15) confidence = 'high';
  else if (majorityPct > 0.05) confidence = 'medium';

  return {
    prediction: Object.fromEntries(sorted),
    winner,
    runnerUp,
    majority,
    majorityPct: Math.round(majorityPct * 1000) / 1000,
    estimatedTurnout: turnout,
    estimatedVotes: totalVotes,
    confidence,
    methodology,
  };
}

/**
 * Predict all wards up for election in a council.
 * @returns {{ wards: Object, seatTotals: Object, totalSeats: number }}
 */
export function predictCouncil(electionsData, wardsUp, assumptions, nationalPolling, ge2024Result, demographicsMap, deprivationMap, constituencyMap, lcc2025, modelParams) {
  const wardResults = {};
  const seatTotals = {};

  // Get current seat counts from council_history or current_holders
  // Start with existing seats NOT up for election
  for (const [wardName, wardData] of Object.entries(electionsData.wards || {})) {
    if (wardsUp.includes(wardName)) continue; // Will be predicted
    for (const holder of (wardData.current_holders || [])) {
      const party = holder.party || 'Unknown';
      seatTotals[party] = (seatTotals[party] || 0) + 1;
    }
  }

  // Predict each ward up for election
  for (const wardName of wardsUp) {
    const wardData = electionsData.wards?.[wardName];
    if (!wardData) continue;

    const result = predictWard(
      wardData,
      assumptions,
      nationalPolling,
      ge2024Result,
      demographicsMap?.[wardName] || null,
      deprivationMap?.[wardName] || null,
      constituencyMap?.[wardName] || null,
      lcc2025,
      modelParams,
    );

    wardResults[wardName] = result;

    if (result.winner) {
      seatTotals[result.winner] = (seatTotals[result.winner] || 0) + 1;
    }
  }

  const totalSeats = Object.values(seatTotals).reduce((s, v) => s + v, 0);

  return { wards: wardResults, seatTotals, totalSeats };
}

/**
 * Apply user overrides to prediction results.
 * @param {Object} councilResult - Output from predictCouncil
 * @param {Object} overrides - { wardName: partyName } manual overrides
 * @param {number} totalSeats - Total council seats
 * @returns {Object} Updated seatTotals
 */
export function applyOverrides(councilResult, overrides, totalSeats) {
  const newSeatTotals = { ...councilResult.seatTotals };

  for (const [wardName, overrideParty] of Object.entries(overrides)) {
    const wardResult = councilResult.wards[wardName];
    if (!wardResult) continue;

    // Remove old winner's seat
    const oldWinner = wardResult.winner;
    if (oldWinner && newSeatTotals[oldWinner]) {
      newSeatTotals[oldWinner]--;
      if (newSeatTotals[oldWinner] <= 0) delete newSeatTotals[oldWinner];
    }

    // Add new winner's seat
    newSeatTotals[overrideParty] = (newSeatTotals[overrideParty] || 0) + 1;
  }

  return newSeatTotals;
}

/**
 * Compute viable coalition combinations from seat totals.
 * @param {Object} seatTotals - { party: seats }
 * @param {number} majorityThreshold - Seats needed for majority
 * @returns {Array} Viable coalitions sorted by total seats
 */
export function computeCoalitions(seatTotals, majorityThreshold) {
  const parties = Object.entries(seatTotals)
    .filter(([, seats]) => seats > 0)
    .sort((a, b) => b[1] - a[1]);

  const coalitions = [];

  // Check single-party majority
  for (const [party, seats] of parties) {
    if (seats >= majorityThreshold) {
      coalitions.push({
        parties: [party],
        totalSeats: seats,
        majority: seats - majorityThreshold + 1,
        type: 'majority',
      });
    }
  }

  // Check two-party coalitions
  for (let i = 0; i < parties.length; i++) {
    for (let j = i + 1; j < parties.length; j++) {
      const total = parties[i][1] + parties[j][1];
      if (total >= majorityThreshold) {
        coalitions.push({
          parties: [parties[i][0], parties[j][0]],
          totalSeats: total,
          majority: total - majorityThreshold + 1,
          type: 'coalition',
        });
      }
    }
  }

  // Check three-party coalitions (only if no two-party works)
  if (!coalitions.some(c => c.type === 'majority' || c.parties.length <= 2)) {
    for (let i = 0; i < parties.length; i++) {
      for (let j = i + 1; j < parties.length; j++) {
        for (let k = j + 1; k < parties.length; k++) {
          const total = parties[i][1] + parties[j][1] + parties[k][1];
          if (total >= majorityThreshold) {
            coalitions.push({
              parties: [parties[i][0], parties[j][0], parties[k][0]],
              totalSeats: total,
              majority: total - majorityThreshold + 1,
              type: 'coalition',
            });
          }
        }
      }
    }
  }

  return coalitions.sort((a, b) => b.totalSeats - a.totalSeats);
}

/**
 * Project ward predictions onto LGR authority boundaries.
 * @param {Object} seatTotals - Predicted seat totals per council
 * @param {Object} lgrModel - LGR proposal model data
 * @returns {Object} Political control projection per authority
 */
export function projectToLGRAuthority(councilSeatTotals, lgrModel) {
  if (!lgrModel?.authorities) return {};

  const projections = {};
  for (const authority of lgrModel.authorities) {
    const combinedSeats = {};
    for (const councilId of (authority.councils || [])) {
      const seats = councilSeatTotals[councilId] || {};
      for (const [party, count] of Object.entries(seats)) {
        combinedSeats[party] = (combinedSeats[party] || 0) + count;
      }
    }

    const totalSeats = Object.values(combinedSeats).reduce((s, v) => s + v, 0);
    const majorityThreshold = Math.floor(totalSeats / 2) + 1;
    const sorted = Object.entries(combinedSeats).sort((a, b) => b[1] - a[1]);
    const largest = sorted[0];

    projections[authority.name] = {
      seats: combinedSeats,
      totalSeats,
      majorityThreshold,
      largestParty: largest?.[0],
      largestPartySeats: largest?.[1] || 0,
      hasMajority: (largest?.[1] || 0) >= majorityThreshold,
      coalitions: computeCoalitions(combinedSeats, majorityThreshold),
    };
  }

  return projections;
}
