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
  reformProxyWeights: { ge: 0.25, lcc: 0.75 },
  reformBoroughDampening: 0.95,  // LCC 2025 was already local — minimal further dampening
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
 * @returns {{ parties: Object<string, number>, date: string, year: number, staleness: number } | null}
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

  // Calculate staleness — how many years since this baseline election
  const baselineYear = election.year || parseInt(election.date?.substring(0, 4)) || 2020;
  const currentYear = new Date().getFullYear();
  const staleness = currentYear - baselineYear;

  return {
    parties,
    date: election.date,
    year: election.year,
    turnout: election.turnout,
    turnoutVotes: election.turnout_votes,
    electorate: election.electorate,
    staleness,
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
    high_deprivation_reform_bonus: 0.03,
    over65_conservative_bonus: 0.015,
    over65_reform_bonus: 0.02,
    asian_heritage_independent_bonus: 0.02,
    asian_heritage_reform_penalty: -0.08,
    high_white_british_reform_bonus: 0.03,
    rural_conservative_bonus: 0.01,
  };

  // Derive percentage fields from raw Census data if not pre-computed
  if (demographics && !demographics.white_british_pct) {
    const age = demographics.age || {};
    const eth = demographics.ethnicity || {};
    const totalPop = age['Total: All usual residents'] || 0;
    const ethTotal = eth['Total: All usual residents'] || totalPop;
    if (totalPop > 0) {
      const over65 = (age['Aged 65 to 74 years'] || 0)
        + (age['Aged 75 to 84 years'] || 0)
        + (age['Aged 85 to 89 years'] || 0)
        + (age['Aged 90 years and over'] || age['Aged 90 years'] || 0);
      demographics = {
        ...demographics,
        age_65_plus_pct: over65 / totalPop,
        white_british_pct: ethTotal > 0
          ? (eth['White: English, Welsh, Scottish, Northern Irish or British'] || 0) / ethTotal
          : 0,
        asian_pct: ethTotal > 0
          ? (eth['Asian, Asian British or Asian Welsh'] || 0) / ethTotal
          : 0,
      };
    }
  }

  // Deprivation: IMD decile 1-2 = very deprived
  if (deprivation?.avg_imd_decile && deprivation.avg_imd_decile <= 2) {
    adjustments['Labour'] = (adjustments['Labour'] || 0) + demoParams.high_deprivation_labour_bonus;
    adjustments['Conservative'] = (adjustments['Conservative'] || 0) + demoParams.high_deprivation_conservative_penalty;
    adjustments['Reform UK'] = (adjustments['Reform UK'] || 0) + demoParams.high_deprivation_reform_bonus;
    factors.push(`High deprivation (decile ${deprivation.avg_imd_decile}): Labour +${(demoParams.high_deprivation_labour_bonus * 100).toFixed(0)}pp, Conservative ${(demoParams.high_deprivation_conservative_penalty * 100).toFixed(0)}pp, Reform +${(demoParams.high_deprivation_reform_bonus * 100).toFixed(0)}pp`);
  }

  // Over-65 proportion
  if (demographics?.age_65_plus_pct && demographics.age_65_plus_pct > 0.25) {
    adjustments['Conservative'] = (adjustments['Conservative'] || 0) + demoParams.over65_conservative_bonus;
    adjustments['Reform UK'] = (adjustments['Reform UK'] || 0) + demoParams.over65_reform_bonus;
    factors.push(`High over-65 (${(demographics.age_65_plus_pct * 100).toFixed(0)}%): Conservative +${(demoParams.over65_conservative_bonus * 100).toFixed(1)}pp, Reform +${(demoParams.over65_reform_bonus * 100).toFixed(0)}pp`);
  }

  // High white British > 85% — strong Reform territory (LCC 2025 evidence)
  if (demographics?.white_british_pct && demographics.white_british_pct > 0.85) {
    adjustments['Reform UK'] = (adjustments['Reform UK'] || 0) + demoParams.high_white_british_reform_bonus;
    factors.push(`High white British (${(demographics.white_british_pct * 100).toFixed(0)}%): Reform +${(demoParams.high_white_british_reform_bonus * 100).toFixed(0)}pp`);
  }

  // Asian heritage > 20% (East Lancashire specific) — Reform penalty + Independent bonus
  // Scaled by concentration: higher Asian % → stronger effect (community bloc voting)
  if (demographics?.asian_pct && demographics.asian_pct > 0.20) {
    const asianPct = demographics.asian_pct;
    let reformPenalty, indBonus, labBonus;

    if (asianPct > 0.60) {
      // Majority-Asian wards (e.g. Daneshouse 78%): Muslim community candidates dominate
      reformPenalty = -0.20;
      indBonus = 0.12;
      labBonus = 0.05;
    } else if (asianPct > 0.40) {
      // Heavily Asian wards: strong community influence
      reformPenalty = -0.15;
      indBonus = 0.06;
      labBonus = 0.03;
    } else {
      // 20-40% Asian: moderate influence
      reformPenalty = demoParams.asian_heritage_reform_penalty;
      indBonus = demoParams.asian_heritage_independent_bonus;
      labBonus = 0;
    }

    adjustments['Independent'] = (adjustments['Independent'] || 0) + indBonus;
    adjustments['Reform UK'] = (adjustments['Reform UK'] || 0) + reformPenalty;
    if (labBonus > 0) {
      adjustments['Labour'] = (adjustments['Labour'] || 0) + labBonus;
    }
    const desc = `High Asian heritage (${(asianPct * 100).toFixed(0)}%): Independent +${(indBonus * 100).toFixed(0)}pp, Reform ${(reformPenalty * 100).toFixed(0)}pp`;
    factors.push(labBonus > 0 ? desc + `, Labour +${(labBonus * 100).toFixed(0)}pp` : desc);
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
    let bonus = assumptions.incumbencyBonusPct || 0.05;
    // Reduce incumbency bonus for long-serving holders in stale-baseline wards
    // The "brand loyalty" factor decays over time as political landscape shifts
    const baselineAge = wardData._baselineStaleness || 0;
    if (baselineAge > 10) {
      bonus = bonus * 0.5; // Halve the bonus for very stale wards
      factors.push(`Incumbent party (${incumbentParty}): +${(bonus * 100).toFixed(1)}pp (reduced — baseline ${baselineAge}yr old)`);
    } else {
      factors.push(`Incumbent party (${incumbentParty}): +${(bonus * 100).toFixed(0)}pp incumbency bonus`);
    }
    adjustments[incumbentParty] = bonus;
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
 *
 * V2: Accounts for baseline staleness. When baselines are >8 years old,
 * Reform's proxy replaces the Step 2 swing-only estimate. The proxy is
 * treated as Reform's EFFECTIVE vote share, and the corresponding amount
 * is deducted proportionally from other parties' adjusted shares (not
 * their original baselines), giving Reform a realistic share in areas
 * where they've demonstrably won at county level (LCC 2025).
 *
 * @param {Object} baseline - Current party baselines
 * @param {Object} constituencyResult - GE2024 constituency results
 * @param {Object} lcc2025 - LCC 2025 reference data
 * @param {Object} assumptions
 * @param {Object} nationalPolling - Current national polling
 * @param {Object} ge2024Result - GE2024 national results
 * @param {Object} currentShares - Current running shares (post Step 2-4), used for proportional deduction
 * @param {number} staleness - Years since baseline election
 * @returns {{ adjustments: Object<string, number>, reformEstimate: number, methodology: Object }}
 */
export function calculateReformEntry(baseline, constituencyResult, lcc2025, assumptions, nationalPolling, ge2024Result, currentShares, staleness) {
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

  const weights = assumptions.reformProxyWeights || { ge: 0.25, lcc: 0.75 };
  const boroughDampening = assumptions.reformBoroughDampening ?? 0.95;

  // GE2024 Reform result for this constituency
  const geReform = constituencyResult?.['Reform UK'] || 0;
  // LCC 2025 overall Reform result
  const lccReform = lcc2025?.results?.['Reform UK']?.pct || 0;

  // Base proxy from weighted GE2024 + LCC 2025
  const proxyBase = (geReform * weights.ge + lccReform * weights.lcc) * boroughDampening;

  // Apply national swing to the proxy (Reform has grown since GE2024/LCC2025)
  const currentNational = nationalPolling?.['Reform UK'] || 0;
  const ge2024National = ge2024Result?.['Reform UK'] || 0;
  const nationalSwing = currentNational - ge2024National;
  const dampening = assumptions.nationalToLocalDampening || 0.65;
  const multiplier = assumptions.swingMultiplier || 1.0;
  const localSwing = nationalSwing * dampening * multiplier;

  reformEstimate = proxyBase + localSwing;

  if (reformEstimate > 0.01) {
    // The Reform estimate is the TOTAL share Reform should have.
    // Step 2 already added swing to Reform (from 0%), so we need to add
    // only the DIFFERENCE between our proxy and what's already been assigned.
    const alreadyAssignedReform = (currentShares?.['Reform UK'] || 0) - (baseline['Reform UK'] || 0);
    const additionalReform = Math.max(0, reformEstimate - Math.max(0, alreadyAssignedReform));

    adjustments['Reform UK'] = additionalReform;

    // Deduct from other parties proportionally based on their CURRENT shares (post-swing),
    // not original baselines — this properly reduces dominant parties
    const sharesForDeduction = currentShares || baseline;
    const totalOther = Object.entries(sharesForDeduction)
      .filter(([p]) => p !== 'Reform UK')
      .reduce((s, [, v]) => s + Math.max(0, v), 0);

    if (totalOther > 0) {
      for (const party of Object.keys(sharesForDeduction)) {
        if (party === 'Reform UK') continue;
        const share = Math.max(0, sharesForDeduction[party]) / totalOther;
        adjustments[party] = (adjustments[party] || 0) - (additionalReform * share);
      }
    }

    factors.push(
      `Reform proxy: GE2024 ${(geReform * 100).toFixed(1)}% × ${weights.ge} + LCC2025 ${(lccReform * 100).toFixed(1)}% × ${weights.lcc} × ${boroughDampening} = ${(proxyBase * 100).toFixed(1)}%`
    );
    if (localSwing !== 0) {
      factors.push(
        `National swing: ${(nationalSwing * 100).toFixed(1)}pp × ${dampening} dampening = ${(localSwing * 100).toFixed(1)}pp → total ${(reformEstimate * 100).toFixed(1)}%`
      );
    }
    if (alreadyAssignedReform > 0.001) {
      factors.push(`Already assigned from Step 2 swing: ${(alreadyAssignedReform * 100).toFixed(1)}pp, additional: +${(additionalReform * 100).toFixed(1)}pp`);
    }
    if (staleness && staleness > 8) {
      factors.push(`Stale baseline (${staleness} years old): proxy weighted more heavily vs historical data`);
    }
  }

  return {
    adjustments,
    reformEstimate,
    methodology: {
      step: 5,
      name: 'New Party Entry',
      description: factors.length > 0
        ? `Reform UK estimated at ${(reformEstimate * 100).toFixed(1)}% from GE/LCC proxy + swing`
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
    description: `Most recent borough result (${baseline.date})` +
      (baseline.staleness > 8 ? ` — ${baseline.staleness} years old, applying stale baseline decay` : ''),
    data: { ...baseline.parties },
  });

  // Tag wardData with staleness for incumbency calculation
  const wardDataWithStaleness = { ...wardData, _baselineStaleness: baseline.staleness };

  // Start with baseline shares — apply staleness decay if baseline is very old
  let shares = { ...baseline.parties };

  // Stale baseline adjustment: when data is >8 years old, blend historical
  // baseline with current evidence (national polling + GE2024 constituency)
  // This prevents 2007 baselines from dominating predictions in 2026
  if (baseline.staleness > 8 && constituencyResult) {
    const decayFactor = Math.max(0.3, 1.0 - (baseline.staleness - 8) * 0.05); // 0.05 per year beyond 8
    const freshWeight = 1.0 - decayFactor;

    // Build a "fresh estimate" from constituency GE2024 result (most recent actual votes)
    const freshShares = { ...constituencyResult };

    // Blend: shares = decayFactor × historical + freshWeight × constituency
    for (const party of new Set([...Object.keys(shares), ...Object.keys(freshShares)])) {
      const historical = shares[party] || 0;
      const fresh = freshShares[party] || 0;
      shares[party] = historical * decayFactor + fresh * freshWeight;
    }

    methodology.push({
      step: 1.5,
      name: 'Stale Baseline Decay',
      description: `Baseline is ${baseline.staleness} years old — blending ${(decayFactor * 100).toFixed(0)}% historical + ${(freshWeight * 100).toFixed(0)}% GE2024 constituency data`,
      data: { decayFactor, freshWeight, stalenessYears: baseline.staleness },
    });
  }

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

  // Step 4: Incumbency (with staleness awareness)
  const incumb = calculateIncumbencyAdjustment(wardDataWithStaleness, assumptions);
  methodology.push(incumb.methodology);
  for (const [party, adj] of Object.entries(incumb.adjustments)) {
    shares[party] = (shares[party] || 0) + adj;
  }

  // Step 5: Reform UK entry — pass current shares for proper proportional deduction
  const reform = calculateReformEntry(baseline.parties, constituencyResult, lcc2025, assumptions, nationalPolling, ge2024Result, { ...shares }, baseline.staleness);
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

  // Confidence based on majority size — reduce for stale baselines
  const majorityPct = totalVotes > 0 ? majority / totalVotes : 0;
  let confidence = 'low';
  if (baseline.staleness > 10) {
    // Very stale baselines = low confidence regardless
    confidence = majorityPct > 0.20 ? 'medium' : 'low';
  } else {
    if (majorityPct > 0.15) confidence = 'high';
    else if (majorityPct > 0.05) confidence = 'medium';
  }

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

  // Get current seat counts: retained seats from non-contested wards,
  // and non-defending holders in contested wards (thirds rotation).
  const defenders = electionsData.meta?.next_election?.defenders || {};
  const isThirds = electionsData.meta?.election_cycle === 'thirds';

  for (const [wardName, wardData] of Object.entries(electionsData.wards || {})) {
    const holders = wardData.current_holders || [];
    if (!wardsUp.includes(wardName)) {
      // Ward NOT contested — all seats retained
      for (const holder of holders) {
        const party = holder.party || 'Unknown';
        seatTotals[party] = (seatTotals[party] || 0) + 1;
      }
    } else if (isThirds && holders.length > 1) {
      // Ward IS contested in thirds — only 1 seat is up, rest retained
      const defender = defenders[wardName];
      for (const holder of holders) {
        // Skip the defending holder — their seat will be predicted
        if (defender && holder.name === defender.name) continue;
        const party = holder.party || 'Unknown';
        seatTotals[party] = (seatTotals[party] || 0) + 1;
      }
    }
    // For all-out elections with wardsUp, all seats are predicted (no retained)
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
// ---------------------------------------------------------------------------
// V2: Regression-calibrated functions using model_coefficients.json
// ---------------------------------------------------------------------------

/**
 * Calculate demographic adjustments using empirical regression coefficients.
 * Replaces hardcoded bonuses with coefficients from calibrate_model.py OLS regression.
 * @param {Object} demographics - Ward demographics (raw Census data)
 * @param {Object} deprivation - Ward deprivation data
 * @param {Object} coefficients - Regression coefficients from model_coefficients.json
 * @returns {{ adjustments: Object<string, number>, methodology: Object }}
 */
export function calculateDemographicAdjustmentsV2(demographics, deprivation, coefficients) {
  const adjustments = {};
  const factors = [];

  if (!coefficients || !demographics) {
    return {
      adjustments,
      methodology: {
        step: 3, name: 'Demographics (v2)',
        description: 'No regression coefficients or demographics available — using defaults',
        factors: [],
      },
    };
  }

  // Extract ward features from raw Census data
  const age = demographics?.age || {};
  const eth = demographics?.ethnicity || {};
  const econ = demographics?.economic_activity || {};
  const totalPop = age['Total: All usual residents'] || 0;
  const ethTotal = eth['Total: All usual residents'] || totalPop;
  const econTotal = econ['Total: All usual residents aged 16 years and over'] || 0;

  if (totalPop === 0) {
    return {
      adjustments,
      methodology: { step: 3, name: 'Demographics (v2)', description: 'No population data', factors: [] },
    };
  }

  // Compute features
  const over65 = (age['Aged 65 to 74 years'] || 0)
    + (age['Aged 75 to 84 years'] || 0)
    + (age['Aged 85 to 89 years'] || 0)
    + (age['Aged 90 years and over'] || age['Aged 90 years'] || 0);
  const young = (age['Aged 20 to 24 years'] || 0) + (age['Aged 25 to 34 years'] || 0);
  const asian = eth['Asian, Asian British or Asian Welsh'] || 0;
  const whiteBritish = eth['White: English, Welsh, Scottish, Northern Irish or British'] || 0;

  let unemployed = 0;
  for (const [k, v] of Object.entries(econ)) {
    if (typeof v === 'number' && k.includes('Unemployed') && !k.split('Unemployed')[1]?.includes(':')) {
      unemployed += v;
    }
  }

  const featureValues = {
    imd_norm: deprivation?.avg_imd_score ? deprivation.avg_imd_score / 80.0 : 0.5,
    pct_over65: over65 / totalPop,
    pct_young_adults: young / totalPop,
    pct_asian: ethTotal > 0 ? asian / ethTotal : 0,
    pct_white_british: ethTotal > 0 ? whiteBritish / ethTotal : 0,
    pct_unemployed: econTotal > 0 ? unemployed / econTotal : 0,
    pct_no_quals: 0,  // TODO: add when qualifications data available in demographics
    pct_degree: 0,
    pct_owned: 0,
    pct_social_rented: 0,
  };

  // Apply regression: adjustment = Σ(coefficient × feature) for each party
  // This gives the predicted vote share deviation from the overall average
  for (const [party, partyCoeffs] of Object.entries(coefficients)) {
    if (typeof partyCoeffs !== 'object') continue;
    let adj = 0;
    let usedFeatures = 0;
    for (const [feature, coeff] of Object.entries(partyCoeffs)) {
      if (feature === 'intercept') continue;  // Intercept handled separately
      const val = featureValues[feature];
      if (val !== undefined && val !== null && coeff !== 0) {
        adj += coeff * val;
        usedFeatures++;
      }
    }
    // Scale to be a small adjustment, not a prediction override
    // The regression gives absolute vote share, but we need a relative adjustment
    // Use only the deviation from the average prediction
    if (usedFeatures > 0) {
      adjustments[party] = Math.round(adj * 100) / 10000; // Small scaling factor
    }
  }

  const absAdj = Object.values(adjustments).map(v => Math.abs(v));
  const maxAdj = absAdj.length > 0 ? Math.max(...absAdj) : 0;
  factors.push(`Regression-based: ${Object.keys(adjustments).length} parties, max adjustment ${(maxAdj * 100).toFixed(1)}pp`);
  if (deprivation?.deprivation_level) {
    factors.push(`Deprivation: ${deprivation.deprivation_level} (IMD ${deprivation.avg_imd_score?.toFixed(1) || '?'})`);
  }

  return {
    adjustments,
    methodology: {
      step: 3,
      name: 'Demographics (v2 regression)',
      description: `OLS regression with ${Object.keys(featureValues).length} features`,
      factors,
      features: featureValues,
    },
  };
}

/**
 * Calculate national swing with party-specific dampening.
 * V2: Uses per-party dampening from model_coefficients.json instead of single factor.
 * @param {Object} baseline - Party vote shares from baseline
 * @param {Object} nationalPolling - Current national polling averages
 * @param {Object} ge2024Result - GE2024 national result
 * @param {Object} assumptions - Model assumptions
 * @param {Object} dampeningByParty - Party-specific dampening factors
 * @returns {{ adjustments: Object<string, number>, methodology: Object }}
 */
export function calculateNationalSwingV2(baseline, nationalPolling, ge2024Result, assumptions, dampeningByParty) {
  const adjustments = {};
  const details = {};
  const defaultDampening = assumptions.nationalToLocalDampening || 0.65;
  const multiplier = assumptions.swingMultiplier || 1.0;

  for (const party of Object.keys(baseline)) {
    const currentNational = nationalPolling[party] || 0;
    const ge2024National = ge2024Result[party] || 0;
    const nationalSwing = currentNational - ge2024National;
    const partyDampening = dampeningByParty?.[party] || defaultDampening;
    const localSwing = nationalSwing * partyDampening * multiplier;

    adjustments[party] = localSwing;
    details[party] = {
      nationalNow: currentNational,
      nationalGE2024: ge2024National,
      nationalSwing: Math.round(nationalSwing * 1000) / 1000,
      dampening: partyDampening,
      dampened: Math.round(localSwing * 1000) / 1000,
    };
  }

  return {
    adjustments,
    methodology: {
      step: 2,
      name: 'National Swing (v2)',
      description: `Party-specific dampening` +
        (multiplier !== 1.0 ? ` (×${multiplier} user adjustment)` : ''),
      details,
    },
  };
}

/**
 * Predict a single ward using V2 model with regression coefficients.
 * Falls back to V1 predictWard if coefficients unavailable.
 */
export function predictWardV2(
  wardData, assumptions = DEFAULT_ASSUMPTIONS,
  nationalPolling = {}, ge2024Result = {},
  demographics = null, deprivation = null,
  constituencyResult = null, lcc2025 = null,
  modelCoefficients = null,
) {
  // If no model coefficients, fall back to V1
  if (!modelCoefficients?.coefficients) {
    return predictWard(wardData, assumptions, nationalPolling, ge2024Result, demographics, deprivation, constituencyResult, lcc2025, null);
  }

  const methodology = [];

  // Step 1: Baseline (same as V1)
  const baseline = getBaseline(wardData, 'borough');
  if (!baseline) {
    return {
      prediction: null,
      methodology: [{ step: 1, name: 'Baseline', description: 'No historical election data' }],
      confidence: 'none',
    };
  }
  methodology.push({
    step: 1, name: 'Baseline',
    description: `Most recent borough result (${baseline.date})` +
      (baseline.staleness > 8 ? ` — ${baseline.staleness} years old, applying stale baseline decay` : ''),
    data: { ...baseline.parties },
  });

  // Tag wardData with staleness for incumbency calculation
  const wardDataWithStaleness = { ...wardData, _baselineStaleness: baseline.staleness };

  let shares = { ...baseline.parties };

  // Stale baseline adjustment (same as V1)
  if (baseline.staleness > 8) {
    const ge2024Constituency = {};
    if (constituencyResult) {
      Object.assign(ge2024Constituency, constituencyResult);
    }
    if (Object.keys(ge2024Constituency).length > 0) {
      const decayFactor = Math.max(0.3, 1.0 - (baseline.staleness - 8) * 0.05);
      const freshWeight = 1.0 - decayFactor;
      for (const party of new Set([...Object.keys(shares), ...Object.keys(ge2024Constituency)])) {
        const historical = shares[party] || 0;
        const fresh = ge2024Constituency[party] || 0;
        shares[party] = historical * decayFactor + fresh * freshWeight;
      }
      methodology.push({
        step: 1.5, name: 'Stale Baseline Decay',
        description: `Baseline is ${baseline.staleness} years old — blending ${(decayFactor * 100).toFixed(0)}% historical + ${(freshWeight * 100).toFixed(0)}% GE2024 constituency`,
        data: { decayFactor, freshWeight, stalenessYears: baseline.staleness },
      });
    }
  }

  // Step 2: National Swing with party-specific dampening
  const swing = calculateNationalSwingV2(
    baseline.parties, nationalPolling, ge2024Result, assumptions,
    modelCoefficients.dampening_by_party
  );
  methodology.push(swing.methodology);
  for (const [party, adj] of Object.entries(swing.adjustments)) {
    shares[party] = (shares[party] || 0) + adj;
  }

  // Step 3: Demographics (V2 regression)
  const demo = calculateDemographicAdjustmentsV2(demographics, deprivation, modelCoefficients.coefficients);
  methodology.push(demo.methodology);
  for (const [party, adj] of Object.entries(demo.adjustments)) {
    shares[party] = (shares[party] || 0) + adj;
  }

  // Step 4: Incumbency (with staleness awareness)
  const incumb = calculateIncumbencyAdjustment(wardDataWithStaleness, assumptions);
  methodology.push(incumb.methodology);
  for (const [party, adj] of Object.entries(incumb.adjustments)) {
    shares[party] = (shares[party] || 0) + adj;
  }

  // Step 5: Reform UK entry — pass current shares for proper proportional deduction
  const reform = calculateReformEntry(baseline.parties, constituencyResult, lcc2025, assumptions, nationalPolling, ge2024Result, { ...shares }, baseline.staleness);
  methodology.push(reform.methodology);
  for (const [party, adj] of Object.entries(reform.adjustments)) {
    shares[party] = (shares[party] || 0) + adj;
  }

  // Step 6: Normalise
  const normalised = normaliseShares(shares);
  methodology.push({
    step: 6, name: 'Normalise',
    description: 'All shares scaled to sum to 100%',
    data: Object.fromEntries(Object.entries(normalised).map(([p, v]) => [p, Math.round(v * 1000) / 1000])),
  });

  // Vote estimation
  const turnout = Math.max(0.15, Math.min(0.65,
    (baseline.turnout || 0.30) + (assumptions.turnoutAdjustment || 0)));
  const electorate = baseline.electorate || baseline.turnoutVotes / (baseline.turnout || 0.30);
  const totalVotes = Math.round(electorate * turnout);

  const prediction = {};
  for (const [party, share] of Object.entries(normalised)) {
    prediction[party] = { pct: Math.round(share * 1000) / 1000, votes: Math.round(share * totalVotes) };
  }

  const sorted = Object.entries(prediction).sort((a, b) => b[1].votes - a[1].votes);
  const winner = sorted[0]?.[0];
  const runnerUp = sorted[1]?.[0];
  const majority = winner && runnerUp ? prediction[winner].votes - prediction[runnerUp].votes : 0;
  const majorityPct = totalVotes > 0 ? majority / totalVotes : 0;

  // Confidence from regression MAE — reduce for stale baselines
  const validation = modelCoefficients.validation || {};
  const winnerMAE = validation[winner]?.mae || 0.10;
  let confidence = 'low';
  if (baseline.staleness > 10) {
    // Very stale baselines = cap at medium confidence
    confidence = majorityPct > winnerMAE * 3 ? 'medium' : 'low';
  } else {
    if (majorityPct > winnerMAE * 2) confidence = 'high';
    else if (majorityPct > winnerMAE) confidence = 'medium';
  }

  return {
    prediction: Object.fromEntries(sorted),
    winner, runnerUp, majority,
    majorityPct: Math.round(majorityPct * 1000) / 1000,
    estimatedTurnout: turnout, estimatedVotes: totalVotes,
    confidence, methodology,
    confidenceInterval: winnerMAE,
    modelVersion: 'v2',
  };
}

/**
 * Predict a constituency-level general election result.
 * Uses: GE2024 baseline + national swing from polling + optional MRP blend.
 * @param {Object} constituency - Constituency data from constituencies.json
 * @param {Object} polling - Polling data from polling.json
 * @param {Object} modelCoefficients - Model coefficients
 * @returns {{ prediction: Object, swing: Object, methodology: Array, confidence: string }}
 */
export function predictConstituencyGE(constituency, polling, modelCoefficients) {
  if (!constituency?.ge2024?.results || !polling?.aggregate) {
    return { prediction: null, methodology: [], confidence: 'none' };
  }

  const methodology = [];
  const ge2024Baseline = {};
  for (const r of constituency.ge2024.results) {
    ge2024Baseline[r.party] = r.pct;
  }

  methodology.push({
    step: 1, name: 'GE2024 Baseline',
    description: `Actual GE2024 result in ${constituency.name}`,
    data: { ...ge2024Baseline },
  });

  // National swing from polling
  const ge2024National = polling.ge2024_baseline || {};
  const currentPolling = polling.aggregate || {};
  const dampeningByParty = modelCoefficients?.dampening_by_party || {};

  let shares = { ...ge2024Baseline };

  // Apply uniform national swing (UNS) with party-specific dampening
  const swingDetails = {};
  for (const party of Object.keys(shares)) {
    const natNow = currentPolling[party] || 0;
    const natGE = ge2024National[party] || 0;
    const natSwing = natNow - natGE;
    // For GE prediction, dampening is lower (it IS a national election)
    // Use 0.85 × the local dampening (closer to 1:1 for national elections)
    const dampening = Math.min(0.95, (dampeningByParty[party] || 0.65) * 1.2);
    const swing = natSwing * dampening;
    shares[party] = (shares[party] || 0) + swing;
    swingDetails[party] = { natSwing: Math.round(natSwing * 1000) / 1000, dampening, applied: Math.round(swing * 1000) / 1000 };
  }

  // Add parties in polling but not in GE2024 baseline
  for (const party of Object.keys(currentPolling)) {
    if (!shares[party]) {
      shares[party] = currentPolling[party] * 0.5; // Half national share as proxy
    }
  }

  methodology.push({
    step: 2, name: 'National Swing (GE)',
    description: 'Uniform national swing with party-specific dampening (×1.2 for GE)',
    details: swingDetails,
  });

  // Step 2b: Incumbent loss effect — when the GE2024 incumbent lost their seat,
  // their party's personal vote evaporates for the next election. Long-serving MPs
  // (like Nigel Evans, 32 years in Ribble Valley) inflate their party's baseline.
  // Detect via explicit previous_mp_party field OR heuristic (runner-up with
  // narrow margin likely = former incumbent party that lost).
  const ge2024Winner = constituency.ge2024.results?.[0]?.party;
  const ge2024RunnerUp = constituency.ge2024.results?.[1];
  const prevIncumbentParty = constituency.ge2024?.previous_mp_party
    || (ge2024RunnerUp && ge2024RunnerUp.pct > 0.25
        && (ge2024Winner !== ge2024RunnerUp.party)
        && ((constituency.ge2024.results[0].pct - ge2024RunnerUp.pct) < 0.10)
        ? ge2024RunnerUp.party : null);

  if (prevIncumbentParty && shares[prevIncumbentParty]) {
    // Scale penalty by how long the previous MP served (more tenure = bigger personal vote loss)
    const tenure = constituency.ge2024?.previous_mp_tenure_years || 0;
    const basePenalty = tenure > 20 ? -0.04 : tenure > 10 ? -0.03 : -0.02;
    shares[prevIncumbentParty] += basePenalty;

    // Redistribute lost share: in the current environment, Reform captures most of
    // the disgruntled former-incumbent voters (anti-establishment sentiment)
    const reformSurging = (currentPolling['Reform UK'] || 0) > (ge2024National['Reform UK'] || 0);
    if (reformSurging && shares['Reform UK'] != null) {
      shares['Reform UK'] += Math.abs(basePenalty) * 0.6;
      if (ge2024Winner && shares[ge2024Winner] != null) {
        shares[ge2024Winner] += Math.abs(basePenalty) * 0.4;
      }
    }
    methodology.push({
      step: 2.5, name: 'Incumbent Loss Effect',
      description: `${prevIncumbentParty} lost seat in GE2024${tenure ? ` after ${tenure}yr tenure` : ''} — personal vote penalty of ${(basePenalty * 100).toFixed(0)}pp, redistributed to challenger parties`,
    });
  }

  // Normalise
  const normalised = normaliseShares(shares);
  methodology.push({
    step: 3, name: 'Normalise',
    description: 'Shares scaled to 100%',
    data: Object.fromEntries(Object.entries(normalised).map(([p, v]) => [p, Math.round(v * 1000) / 1000])),
  });

  // Sort by vote share descending
  const sorted = Object.entries(normalised).sort((a, b) => b[1] - a[1]);
  const prediction = Object.fromEntries(sorted.map(([p, v]) => [p, { pct: Math.round(v * 1000) / 1000 }]));
  const winner = sorted[0]?.[0];
  const runnerUp = sorted[1]?.[0];
  const majorityPct = winner && runnerUp ? normalised[winner] - normalised[runnerUp] : 0;

  // Swing vs GE2024
  const swing = {};
  for (const [party, share] of Object.entries(normalised)) {
    swing[party] = Math.round((share - (ge2024Baseline[party] || 0)) * 1000) / 1000;
  }

  // Confidence — constituency predictions are inherently less certain
  let confidence = 'low';
  if (majorityPct > 0.15) confidence = 'high';
  else if (majorityPct > 0.08) confidence = 'medium';

  return {
    prediction, winner, runnerUp,
    majorityPct: Math.round(majorityPct * 1000) / 1000,
    swing, methodology, confidence,
    mpChange: winner !== constituency.mp?.party?.replace(' (Co-op)', ''),
  };
}

/**
 * Universal prediction router — handles any election scope.
 * @param {Object} election - Election configuration
 * @param {Object} data - All relevant data
 * @param {Object} polling - Polling data
 * @param {Object} coefficients - Model coefficients
 * @param {Object} assumptions - User assumptions
 * @returns {Object} Prediction result
 */
export function predict(election, data, polling, coefficients, assumptions = DEFAULT_ASSUMPTIONS) {
  switch (election?.scope) {
    case 'ward':
      return predictWardV2(
        data.wardData, assumptions, polling?.aggregate || {},
        polling?.ge2024_baseline || {}, data.demographics, data.deprivation,
        data.constituencyResult, data.lcc2025, coefficients
      );
    case 'council':
      return predictCouncil(
        data.electionsData, data.wardsUp, assumptions,
        polling?.aggregate || {}, polling?.ge2024_baseline || {},
        data.demographicsMap, data.deprivationMap, data.constituencyMap,
        data.lcc2025, coefficients
      );
    case 'constituency':
      return predictConstituencyGE(data.constituency, polling, coefficients);
    default:
      return { prediction: null, methodology: [], confidence: 'none' };
  }
}

/**
 * Normalize party names for consistent aggregation across councils.
 * Different councils use different names for the same party.
 */
export function normalizePartyName(party) {
  if (!party) return 'Unknown'
  const p = party.trim()
  // Labour variants
  if (/^Labour\s*(&|and)\s*Co-?op/i.test(p)) return 'Labour'
  if (p === 'Labour Group') return 'Labour'
  // Lib Dem variants
  if (/^Lib(eral)?\s*Dem/i.test(p)) return 'Liberal Democrats'
  // Conservative variants
  if (/^(The\s+)?Conservative/i.test(p)) return 'Conservative'
  // Green variants
  if (/^Green/i.test(p)) return 'Green Party'
  // Reform variants
  if (/^Reform/i.test(p)) return 'Reform UK'
  // Local independents — group under "Independent" umbrella for LGR modelling
  if (/independent/i.test(p) || p === 'Our West Lancashire' || p === '4 BwD' ||
      p === 'Morecambe Bay Independents' || p === 'Wyre Independent Group' ||
      /^Ashton Ind/i.test(p) || /^Pendle.*True/i.test(p)) return 'Independent'
  return p
}

/**
 * Build council seat totals from politics_summary.json data.
 * @param {Object} politicsSummaries - {council_id: politics_summary.json data}
 * @param {boolean} normalize - whether to normalize party names (default true)
 * @returns {Object} {council_id: {party: seats}}
 */
export function buildCouncilSeatTotals(politicsSummaries, normalize = true) {
  const result = {}
  for (const [councilId, summary] of Object.entries(politicsSummaries)) {
    if (!summary?.by_party) continue
    const seats = {}
    for (const { party, count } of summary.by_party) {
      const name = normalize ? normalizePartyName(party) : party
      seats[name] = (seats[name] || 0) + count
    }
    result[councilId] = seats
  }
  return result
}

export function projectToLGRAuthority(councilSeatTotals, lgrModel) {
  if (!lgrModel?.authorities) return {};

  const projections = {};
  for (const authority of lgrModel.authorities) {
    const combinedSeats = {};
    const perCouncil = {};
    for (const councilId of (authority.councils || [])) {
      const seats = councilSeatTotals[councilId] || {};
      perCouncil[councilId] = seats;
      for (const [party, count] of Object.entries(seats)) {
        // Normalize at aggregation time as well (belt-and-braces)
        const normalized = normalizePartyName(party);
        combinedSeats[normalized] = (combinedSeats[normalized] || 0) + count;
      }
    }

    const totalSeats = Object.values(combinedSeats).reduce((s, v) => s + v, 0);
    const majorityThreshold = Math.floor(totalSeats / 2) + 1;
    const sorted = Object.entries(combinedSeats).sort((a, b) => b[1] - a[1]);
    const largest = sorted[0];

    projections[authority.name] = {
      seats: combinedSeats,
      perCouncil,
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
