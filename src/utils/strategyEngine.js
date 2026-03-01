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
// Shared Utilities
// ---------------------------------------------------------------------------

/** Unified quick-win detection — matches ETL engine definition exactly. */
export function isQuickWin(asset) {
  return (
    (asset.disposal_pathway === 'quick_win_auction' || asset.disposal_pathway === 'private_treaty_sale') &&
    (asset.disposal_complexity || 0) <= 30 &&
    (asset.market_readiness || 0) >= 60 &&
    (asset.occupancy_status === 'vacant_land' || asset.occupancy_status === 'likely_vacant')
  );
}

// ---------------------------------------------------------------------------
// Talking Points Generator
// ---------------------------------------------------------------------------

/**
 * Generate talking points based on LCC property/land assets in a ward/CED.
 * @param {string} cedName - CED or ward name
 * @param {Array} propertyAssets - Array of asset objects from property_assets.json
 * @returns {Array<{ category: string, icon: string, priority: number, text: string }>}
 */
export function generateAssetTalkingPoints(cedName, propertyAssets) {
  const points = [];
  if (!cedName || !propertyAssets?.length) return points;

  // Filter assets in this CED
  const wardAssets = propertyAssets.filter(a =>
    a.ced === cedName || a.ward === cedName
  );
  if (wardAssets.length === 0) return points;

  // Total assets in ward
  points.push({
    category: 'Property',
    icon: 'Building',
    priority: 2,
    text: `${wardAssets.length} LCC-owned asset${wardAssets.length !== 1 ? 's' : ''} in this division — scrutinise maintenance costs and utilisation.`,
  });

  // Quick win disposals (uses shared definition)
  const quickWins = wardAssets.filter(isQuickWin);
  if (quickWins.length > 0) {
    points.push({
      category: 'Property',
      icon: 'TrendingUp',
      priority: 1,
      text: `${quickWins.length} quick-win disposal${quickWins.length !== 1 ? 's' : ''} — low complexity, market-ready assets that could generate receipts within 6 months.`,
    });
  }

  // Community asset transfer opportunities
  const catAssets = wardAssets.filter(a => a.disposal_pathway === 'community_asset_transfer');
  if (catAssets.length > 0) {
    points.push({
      category: 'Property',
      icon: 'Heart',
      priority: 2,
      text: `${catAssets.length} asset${catAssets.length !== 1 ? 's' : ''} suitable for community asset transfer — engage local groups and voluntary organisations.`,
    });
  }

  // Energy/carbon opportunities
  const greenAssets = wardAssets.filter(a =>
    a.disposal_pathway === 'energy_generation' || a.disposal_pathway === 'carbon_offset_woodland'
  );
  if (greenAssets.length > 0) {
    points.push({
      category: 'Property',
      icon: 'Leaf',
      priority: 2,
      text: `${greenAssets.length} site${greenAssets.length !== 1 ? 's' : ''} identified for energy generation or carbon offset — net zero strategy alignment.`,
    });
  }

  // School grounds (sensitive)
  const schoolAssets = wardAssets.filter(a => a.occupancy_status === 'school_grounds');
  if (schoolAssets.length > 0) {
    points.push({
      category: 'Property',
      icon: 'School',
      priority: 3,
      text: `${schoolAssets.length} school sites — LCC freehold under active institutions, cannot be disposed without school closure.`,
    });
  }

  // High condition spend
  const conditionSpend = wardAssets.reduce((sum, a) => sum + (a.condition_spend || 0), 0);
  if (conditionSpend > 10000) {
    points.push({
      category: 'Property',
      icon: 'PoundSterling',
      priority: 2,
      text: `£${Math.round(conditionSpend / 1000)}k spent on maintenance of LCC assets in this area — question value for money.`,
    });
  }

  // Linked supplier spend
  const linkedSpend = wardAssets.reduce((sum, a) => sum + (a.linked_spend || 0), 0);
  if (linkedSpend > 50000) {
    points.push({
      category: 'Property',
      icon: 'PoundSterling',
      priority: 3,
      text: `£${Math.round(linkedSpend / 1000)}k supplier spend linked to LCC properties here — cross-reference with DOGE findings.`,
    });
  }

  // Co-location opportunities
  const coLocatable = wardAssets.filter(a => (a.nearby_500m || 0) > 0);
  if (coLocatable.length >= 2) {
    points.push({
      category: 'Property',
      icon: 'MapPin',
      priority: 3,
      text: `${coLocatable.length} assets within 500m of each other — co-location/consolidation could save money.`,
    });
  }

  // Energy risk
  const energyRisk = wardAssets.filter(a => a.flags?.includes('energy_risk'));
  if (energyRisk.length > 0) {
    points.push({
      category: 'Property',
      icon: 'Zap',
      priority: 3,
      text: `${energyRisk.length} asset${energyRisk.length !== 1 ? 's' : ''} flagged as energy risk (poor EPC/no rating) — net zero accountability.`,
    });
  }

  // Heritage constraints
  const listed = wardAssets.filter(a => a.listed_building_grade);
  if (listed.length > 0) {
    points.push({
      category: 'Property',
      icon: 'Shield',
      priority: 3,
      text: `${listed.length} listed building${listed.length !== 1 ? 's' : ''} — heritage constraints affect disposal options and maintenance obligations.`,
    });
  }

  // Flood risk
  const floodRisk = wardAssets.filter(a => a.flood_zone >= 2);
  if (floodRisk.length > 0) {
    points.push({
      category: 'Property',
      icon: 'AlertTriangle',
      priority: 3,
      text: `${floodRisk.length} asset${floodRisk.length !== 1 ? 's' : ''} in flood zone — environmental risk disclosure required for any disposal.`,
    });
  }

  // Valuation context
  const withComps = wardAssets.filter(a => (a.lr_median_price || 0) > 0);
  if (withComps.length > 0) {
    const medians = withComps.map(a => a.lr_median_price);
    const areaAvg = Math.round(medians.reduce((s, p) => s + p, 0) / medians.length);
    const fmt = areaAvg >= 1000000
      ? `£${(areaAvg / 1000000).toFixed(1)}M`
      : `£${Math.round(areaAvg / 1000)}k`;
    points.push({
      category: 'Property',
      icon: 'TrendingUp',
      priority: 3,
      text: `Area median property price: ${fmt} (Land Registry) — context for asset valuation and disposal pricing.`,
    });
  }

  // Green Book appraisal highlights
  const withGb = wardAssets.filter(a => a.gb_market_value > 0);
  if (withGb.length > 0) {
    const totalMv = withGb.reduce((s, a) => s + (a.gb_market_value || 0), 0);
    const totalHolding = withGb.reduce((s, a) => s + (a.gb_holding_cost || 0), 0);
    const fmtMv = totalMv >= 1000000 ? `£${(totalMv / 1000000).toFixed(1)}M` : `£${Math.round(totalMv / 1000)}k`;
    const fmtHc = totalHolding >= 1000000 ? `£${(totalHolding / 1000000).toFixed(1)}M` : `£${Math.round(totalHolding / 1000)}k`;
    points.push({
      category: 'Property',
      icon: 'Scale',
      priority: 2,
      text: `Green Book: ${fmtMv} total estimated market value, ${fmtHc}/yr holding costs — options appraisals available for ${withGb.length} assets.`,
    });

    // Preferred option breakdown
    const prefCounts = {};
    for (const a of withGb) {
      const pref = a.gb_preferred_option || 'unknown';
      prefCounts[pref] = (prefCounts[pref] || 0) + 1;
    }
    const disposeCount = (prefCounts.dispose || 0) + (prefCounts.redevelop || 0);
    const repurposeCount = prefCounts.repurpose || 0;
    const catCount = prefCounts.community_transfer || 0;
    if (disposeCount > 0 || repurposeCount > 0) {
      const parts = [];
      if (disposeCount > 0) parts.push(`${disposeCount} for disposal/redevelopment`);
      if (repurposeCount > 0) parts.push(`${repurposeCount} for repurpose`);
      if (catCount > 0) parts.push(`${catCount} for community transfer`);
      points.push({
        category: 'Property',
        icon: 'BarChart3',
        priority: 2,
        text: `Green Book preferred options: ${parts.join(', ')} — evidence-based HM Treasury methodology.`,
      });
    }
  }

  // Red Book (RICS) valuation highlights
  const withRb = wardAssets.filter(a => (a.rb_market_value || 0) > 0);
  if (withRb.length > 0) {
    const rbTotalMv = withRb.reduce((s, a) => s + (a.rb_market_value || 0), 0);
    const fmtRb = rbTotalMv >= 1000000 ? `£${(rbTotalMv / 1000000).toFixed(1)}M` : `£${Math.round(rbTotalMv / 1000)}k`;
    points.push({
      category: 'Property',
      icon: 'Scale',
      priority: 2,
      text: `Red Book (RICS): ${fmtRb} market value across ${withRb.length} assets — basis for disposal pricing and balance sheet.`,
    });
  }

  // Ownership: subsidiary/JV assets in ward
  const subsidiaryAssets = wardAssets.filter(a => a.tier === 'subsidiary' || a.tier === 'jv');
  if (subsidiaryAssets.length > 0) {
    const entities = [...new Set(subsidiaryAssets.map(a => a.owner_entity).filter(Boolean))];
    const subMv = subsidiaryAssets.reduce((s, a) => s + (a.rb_market_value || 0), 0);
    const fmtSubMv = subMv >= 1000000 ? `£${(subMv / 1000000).toFixed(1)}M` : subMv > 0 ? `£${Math.round(subMv / 1000)}k` : '';
    const valPart = fmtSubMv ? ` valued at ${fmtSubMv}` : '';
    points.push({
      category: 'Property',
      icon: 'Building',
      priority: 2,
      text: `${subsidiaryAssets.length} subsidiary/JV asset${subsidiaryAssets.length !== 1 ? 's' : ''}${valPart} held by ${entities.join(', ')} — LGR transfer requires board approval.`,
    });
  }

  // Third-party/partnership assets
  const thirdPartyAssets = wardAssets.filter(a => a.ownership_model === 'third_party');
  if (thirdPartyAssets.length > 0) {
    points.push({
      category: 'Property',
      icon: 'Shield',
      priority: 3,
      text: `${thirdPartyAssets.length} third-party/partnership asset${thirdPartyAssets.length !== 1 ? 's' : ''} (NHS, police, foundation schools) — LCC freehold but not fully controlled.`,
    });
  }

  return points;
}

/**
 * Generate a property summary object for a ward dossier.
 * @param {string} wardName - CED or ward name
 * @param {Array} propertyAssets - Array of asset objects from property_assets.json
 * @returns {Object|null} Summary object or null if no assets
 */
export function generatePropertySummary(wardName, propertyAssets) {
  if (!wardName || !propertyAssets?.length) return null;
  const wardAssets = propertyAssets.filter(a => a.ced === wardName || a.ward === wardName);
  if (wardAssets.length === 0) return null;

  const totalSpend = wardAssets.reduce((s, a) => s + (a.linked_spend || 0), 0);
  const conditionSpend = wardAssets.reduce((s, a) => s + (a.condition_spend || 0), 0);
  const quickWins = wardAssets.filter(isQuickWin);
  const energyRisk = wardAssets.filter(a => a.flags?.includes('energy_risk'));

  // Pathway breakdown
  const pathways = {};
  for (const a of wardAssets) {
    const pw = a.disposal_pathway || 'unknown';
    pathways[pw] = (pathways[pw] || 0) + 1;
  }

  // Occupancy breakdown
  const occupancy = {};
  for (const a of wardAssets) {
    const occ = a.occupancy_status || 'unknown';
    occupancy[occ] = (occupancy[occ] || 0) + 1;
  }

  const categories = {};
  for (const a of wardAssets) {
    const cat = a.category || 'unknown';
    categories[cat] = (categories[cat] || 0) + 1;
  }

  // Heritage / environmental constraints
  const listedCount = wardAssets.filter(a => a.listed_building_grade).length;
  const floodZoneCount = wardAssets.filter(a => a.flood_zone >= 2).length;
  const sssiCount = wardAssets.filter(a => a.sssi_nearby).length;
  const aonbCount = wardAssets.filter(a => a.aonb_name).length;

  // Valuation context (Land Registry comparables)
  const withComps = wardAssets.filter(a => (a.lr_comparables_count || 0) > 0);
  const medianPrices = withComps.map(a => a.lr_median_price).filter(Boolean);
  const areaMedian = medianPrices.length > 0
    ? Math.round(medianPrices.reduce((s, p) => s + p, 0) / medianPrices.length)
    : null;

  return {
    total: wardAssets.length,
    totalSpend,
    conditionSpend,
    quickWinCount: quickWins.length,
    energyRiskCount: energyRisk.length,
    pathways,
    occupancy,
    categories,
    listedCount,
    floodZoneCount,
    sssiCount,
    aonbCount,
    valuationContext: areaMedian ? {
      assetsWithComps: withComps.length,
      areaMedianPrice: areaMedian,
    } : null,
    greenBook: (() => {
      const withGb = wardAssets.filter(a => a.gb_market_value > 0);
      if (withGb.length === 0) return null;
      const prefCounts = {};
      for (const a of withGb) {
        const pref = a.gb_preferred_option || 'unknown';
        prefCounts[pref] = (prefCounts[pref] || 0) + 1;
      }
      return {
        totalMarketValue: withGb.reduce((s, a) => s + (a.gb_market_value || 0), 0),
        totalHoldingCost: withGb.reduce((s, a) => s + (a.gb_holding_cost || 0), 0),
        totalPreferredNpv: withGb.reduce((s, a) => s + (a.gb_preferred_npv || 0), 0),
        preferredBreakdown: prefCounts,
        assetsAppraised: withGb.length,
      };
    })(),
    redBook: (() => {
      const withRb = wardAssets.filter(a => (a.rb_market_value || 0) > 0);
      if (withRb.length === 0) return null;
      const basisCounts = {};
      for (const a of withRb) {
        const b = a.rb_valuation_basis || 'unknown';
        basisCounts[b] = (basisCounts[b] || 0) + 1;
      }
      return {
        totalMarketValue: withRb.reduce((s, a) => s + (a.rb_market_value || 0), 0),
        totalEUV: withRb.reduce((s, a) => s + (a.rb_euv || 0), 0),
        basisBreakdown: basisCounts,
        assetsValued: withRb.length,
      };
    })(),
    ownership: (() => {
      const byTier = {};
      const byEntity = {};
      for (const a of wardAssets) {
        const t = a.tier || 'county';
        byTier[t] = (byTier[t] || 0) + 1;
        const e = a.owner_entity || 'LCC';
        byEntity[e] = (byEntity[e] || 0) + 1;
      }
      const subsidiaryCount = wardAssets.filter(a => a.tier === 'subsidiary' || a.tier === 'jv').length;
      const thirdPartyCount = wardAssets.filter(a => a.ownership_model === 'third_party').length;
      return {
        byTier,
        byEntity,
        subsidiaryCount,
        thirdPartyCount,
        directCount: wardAssets.filter(a => a.ownership_model === 'direct').length,
      };
    })(),
    assets: wardAssets.map(a => ({
      id: a.id, name: a.name, category: a.category,
      epc_rating: a.epc_rating, disposal_pathway: a.disposal_pathway,
      occupancy_status: a.occupancy_status,
      disposal_complexity: a.disposal_complexity || 0,
      linked_spend: a.linked_spend || 0, condition_spend: a.condition_spend || 0,
      listed_building_grade: a.listed_building_grade || null,
      flood_zone: a.flood_zone || 0,
      lr_median_price: a.lr_median_price || null,
      gb_market_value: a.gb_market_value || null,
      gb_preferred_option: a.gb_preferred_option || null,
      gb_preferred_npv: a.gb_preferred_npv || null,
      rb_market_value: a.rb_market_value || null,
      rb_valuation_basis: a.rb_valuation_basis || null,
      owner_entity: a.owner_entity || null,
      tier: a.tier || null,
      ownership_pct: a.ownership_pct ?? null,
    })),
  };
}

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

// ---------------------------------------------------------------------------
// Ward Dossier System
// ---------------------------------------------------------------------------

/**
 * Generate attack lines for an incumbent councillor.
 * @param {Object} councillor - From councillors.json
 * @param {Object|null} integrity - From integrity.json
 * @param {Object|null} interests - From register_of_interests.json
 * @returns {Array<{ severity: string, text: string }>}
 */
export function generateAttackLines(councillor, integrity, interests) {
  const lines = [];
  if (!councillor) return lines;

  // No executive roles — invisible councillor
  const roles = councillor.roles || [];
  const execRoles = roles.filter(r =>
    /exec|cabinet|chair|lead|portfolio/i.test(typeof r === 'string' ? r : r.role || '')
  );
  if (execRoles.length === 0) {
    lines.push({
      severity: 'medium',
      text: `${councillor.name} holds no executive or committee chair roles — what have they achieved for this ward?`,
    });
  }

  // Integrity red flags
  if (integrity) {
    const redFlags = integrity.red_flags || [];
    if (redFlags.length > 0) {
      lines.push({
        severity: 'high',
        text: `${redFlags.length} integrity red flag${redFlags.length > 1 ? 's' : ''} identified: ${redFlags.slice(0, 2).map(f => f.description || f.flag || f).join('; ')}`,
      });
    }
    if ((integrity.total_directorships || 0) > 2) {
      lines.push({
        severity: 'medium',
        text: `${integrity.total_directorships} company directorships found — potential conflicts of interest with council decisions.`,
      });
    }
    if (integrity.risk_level === 'high' || integrity.risk_level === 'elevated') {
      lines.push({
        severity: 'high',
        text: `Integrity risk level: ${integrity.risk_level}. Score: ${integrity.integrity_score}/100.`,
      });
    }
  }

  // Register of interests — declared companies
  if (interests) {
    const companies = interests.declared_companies || [];
    if (companies.length > 0) {
      lines.push({
        severity: 'medium',
        text: `${companies.length} declared business interest${companies.length > 1 ? 's' : ''}: ${companies.slice(0, 3).join(', ')}. Do these conflict with council decisions?`,
      });
    }
    const employment = interests.declared_employment || [];
    if (employment.length > 2) {
      lines.push({
        severity: 'low',
        text: `${employment.length} declared employment interests — is this a part-time councillor?`,
      });
    }
    const securities = (interests.declared_securities || []).filter(s =>
      s && s.toLowerCase() !== 'no' && s.toLowerCase() !== 'none'
    );
    if (securities.length > 0) {
      lines.push({
        severity: 'medium',
        text: `Declared financial securities: ${securities.slice(0, 2).join('; ')}.`,
      });
    }
  }

  // Party-specific criticism
  const party = (councillor.party || '').toLowerCase();
  if (party.includes('green')) {
    lines.push({ severity: 'low', text: 'Green Party councillor — focus on virtue-signalling policies vs practical local delivery.' });
  } else if (party.includes('labour')) {
    lines.push({ severity: 'low', text: 'Labour councillor — link to Starmer government failures, national insurance hikes, broken promises.' });
  } else if (party.includes('conservative')) {
    lines.push({ severity: 'low', text: 'Conservative councillor — link to 14 years of failure, broken levelling up promises, channel crossings.' });
  } else if (party.includes('lib') || party.includes('democrat')) {
    lines.push({ severity: 'low', text: 'Lib Dem councillor — flip-flopping positions, tuition fee betrayal legacy, unclear local priorities.' });
  } else if (party.includes('independent')) {
    lines.push({ severity: 'low', text: 'Independent councillor — no party machine or national support, limited influence on council policy.' });
  }

  return lines;
}

/**
 * Generate council-level attack lines from spending/performance data.
 * @param {Object|null} dogeFindings - From doge_findings.json
 * @param {Object|null} budgetSummary - From budgets_summary.json
 * @param {Object|null} collectionRates - From collection_rates.json
 * @param {Object|null} politicsSummary - From politics_summary.json
 * @returns {Array<{ severity: string, category: string, text: string }>}
 */
export function generateCouncilAttackLines(dogeFindings, budgetSummary, collectionRates, politicsSummary) {
  const lines = [];

  if (dogeFindings) {
    // Duplicate payments
    const findings = dogeFindings.findings || [];
    const duplicates = findings.find(f => /duplicate/i.test(f.label || ''));
    if (duplicates) {
      lines.push({
        severity: duplicates.severity === 'critical' ? 'high' : 'medium',
        category: 'Spending',
        text: `${duplicates.value} in ${duplicates.label?.toLowerCase() || 'duplicate payments'} — taxpayer money wasted through incompetence.`,
      });
    }

    // Split payments
    const splits = findings.find(f => /split/i.test(f.label || ''));
    if (splits) {
      lines.push({
        severity: 'medium',
        category: 'Spending',
        text: `${splits.value} in ${splits.label?.toLowerCase() || 'suspected split payments'} — possible evasion of spending controls.`,
      });
    }

    // Round numbers
    const rounds = findings.find(f => /round/i.test(f.label || ''));
    if (rounds) {
      lines.push({
        severity: 'low',
        category: 'Spending',
        text: `${rounds.value} in round-number payments — estimates instead of proper invoices?`,
      });
    }

    // Fraud triangle
    const ft = dogeFindings.fraud_triangle;
    if (ft?.overall_score > 60) {
      lines.push({
        severity: ft.overall_score > 70 ? 'high' : 'medium',
        category: 'Governance',
        text: `Fraud triangle score: ${ft.overall_score}/100 (${ft.risk_level || 'elevated'}). Systemic weaknesses in financial controls.`,
      });
    }

    // Supplier concentration
    const sc = dogeFindings.supplier_concentration;
    if (sc?.top5?.suppliers?.[0]) {
      const topPct = sc.top5.suppliers[0].pct;
      if (topPct > 8) {
        lines.push({
          severity: 'medium',
          category: 'Procurement',
          text: `Top supplier (${sc.top5.suppliers[0].supplier}) takes ${topPct}% of all spending — is this value for money?`,
        });
      }
    }
  }

  // Collection rates
  if (collectionRates) {
    const rate = collectionRates.latest_rate;
    if (rate && rate < 96) {
      lines.push({
        severity: rate < 94 ? 'high' : 'medium',
        category: 'Council Tax',
        text: `Council tax collection rate just ${rate}% vs national ~97%. ${collectionRates.trend_direction === 'declining' ? 'And it\'s declining.' : ''}`,
      });
    }
  }

  // Budget/reserves
  if (budgetSummary) {
    const reserves = budgetSummary.reserves;
    if (reserves) {
      const change = (reserves.total_closing || 0) - (reserves.total_opening || 0);
      if (change < 0) {
        const changeMil = (Math.abs(change) / 1000000).toFixed(1);
        lines.push({
          severity: Math.abs(change) > 2000000 ? 'high' : 'medium',
          category: 'Finances',
          text: `Council reserves fell by £${changeMil}M — are they spending beyond their means?`,
        });
      }
    }
    const ctBandD = budgetSummary.council_tax?.band_d_by_year;
    if (ctBandD) {
      const years = Object.keys(ctBandD).sort();
      const latest = ctBandD[years[years.length - 1]];
      const prev = ctBandD[years[years.length - 2]];
      if (latest && prev && latest > prev) {
        const increase = ((latest - prev) / prev * 100).toFixed(1);
        lines.push({
          severity: 'medium',
          category: 'Council Tax',
          text: `Council tax Band D up ${increase}% to £${latest.toFixed(2)} — are residents getting value for money?`,
        });
      }
    }
  }

  // Political control
  if (politicsSummary) {
    const coalition = politicsSummary.coalition;
    if (coalition && !coalition.majority) {
      lines.push({
        severity: 'low',
        category: 'Governance',
        text: `No overall control — ${coalition.type || 'NOC'}. Council paralysed by political horse-trading.`,
      });
    }
  }

  return lines;
}

/**
 * Generate national Reform UK talking points tailored to ward demographics.
 * @param {Object|null} constituencyData - From constituencies.json
 * @param {Object|null} demographics - Census ward data
 * @param {Object|null} deprivation - IMD ward data
 * @param {string} ourParty - Party name
 * @returns {Array<{ priority: number, category: string, icon: string, text: string }>}
 */
export function generateNationalLines(constituencyData, demographics, deprivation, ourParty = 'Reform UK') {
  const points = [];
  const isReform = /reform/i.test(ourParty);

  // Demographic-tailored national lines
  const totalPop = demographics?.age?.['Total: All usual residents'] || 0;
  const whiteBritishPct = totalPop > 0
    ? (demographics?.ethnicity?.['White: English, Welsh, Scottish, Northern Irish or British'] || 0) / totalPop
    : 0;

  const over65 = totalPop > 0
    ? ((demographics?.age?.['Aged 65 to 74 years'] || 0) +
       (demographics?.age?.['Aged 75 to 84 years'] || 0) +
       (demographics?.age?.['Aged 85 years and over'] || 0)) / totalPop
    : 0;

  const decile = deprivation?.avg_imd_decile ?? 5;
  const homeOwnerPct = demographics?.tenure
    ? (demographics.tenure['Owned'] || 0) / (demographics.tenure['Total: All households'] || 1)
    : 0;

  // Immigration / borders — strongest in high White British areas
  if (isReform && whiteBritishPct > 0.90) {
    points.push({
      priority: 1,
      category: 'National',
      icon: 'Globe',
      text: 'Stop the boats. Control immigration. Protect British culture and community cohesion.',
    });
  }

  // NHS / social care — strongest in older areas
  if (over65 > 0.20) {
    points.push({
      priority: 1,
      category: 'National',
      icon: 'Users',
      text: 'NHS waiting lists at record levels. Social care crisis. Protect the pension triple lock.',
    });
  }

  // Cost of living — strongest in deprived areas
  if (decile <= 4) {
    points.push({
      priority: 1,
      category: 'National',
      icon: 'TrendingDown',
      text: 'Cost of living crisis: energy bills, food prices, mortgage rates. Labour promised change — nothing changed.',
    });
  }

  // Housing — key for renters / young areas
  if (homeOwnerPct < 0.60) {
    points.push({
      priority: 2,
      category: 'National',
      icon: 'MapPin',
      text: 'Housing crisis: unaffordable rents, social housing waiting lists, developers profiteering.',
    });
  }

  // Council tax value
  points.push({
    priority: 3,
    category: 'National',
    icon: 'Briefcase',
    text: 'Council tax rises every year but services get worse. Reform will demand value for every penny.',
  });

  // Anti-establishment
  if (isReform) {
    points.push({
      priority: 2,
      category: 'National',
      icon: 'Swords',
      text: 'Labour, Tories, Lib Dems — they\'ve all had their turn. None of them delivered. Time for Reform.',
    });
  }

  // Constituency-specific GE2024 result
  if (constituencyData?.ge2024) {
    const reformResult = constituencyData.ge2024.results?.find(r =>
      /reform/i.test(r.party || '')
    );
    if (reformResult) {
      const pct = (reformResult.pct * 100).toFixed(1);
      points.push({
        priority: 1,
        category: 'Constituency',
        icon: 'TrendingUp',
        text: `Reform got ${pct}% (${reformResult.votes.toLocaleString()} votes) at the 2024 General Election here — 2nd place and growing.`,
      });
    }
  }

  // MP criticism
  if (constituencyData?.mp) {
    const mp = constituencyData.mp;
    const vr = constituencyData.voting_record;
    if (vr && vr.rebellions === 0) {
      points.push({
        priority: 2,
        category: 'Constituency',
        icon: 'Target',
        text: `Your MP ${mp.name} (${mp.party}): zero rebellions in ${vr.total_divisions} votes — a Westminster lobby fodder.`,
      });
    }
    if (mp.expenses?.total_claimed > 200000) {
      points.push({
        priority: 3,
        category: 'Constituency',
        icon: 'Briefcase',
        text: `MP ${mp.name} claimed £${Math.round(mp.expenses.total_claimed / 1000)}K in expenses. Are they working for you or themselves?`,
      });
    }
  }

  // Claimant count
  if (constituencyData?.claimant_count?.length > 0) {
    const latest = constituencyData.claimant_count[0];
    if (latest.claimant_rate_pct > 4) {
      points.push({
        priority: 2,
        category: 'Constituency',
        icon: 'Briefcase',
        text: `${latest.claimant_rate_pct}% claimant rate locally (${latest.claimant_count.toLocaleString()} people). Get people into good jobs.`,
      });
    }
  }

  return points.sort((a, b) => a.priority - b.priority);
}

/**
 * Build a ward profile from demographics and deprivation data.
 * @param {Object|null} demographics - Census 2021 ward data
 * @param {Object|null} deprivation - IMD 2019 ward data
 * @param {Object|null} wardElection - Election data for ward
 * @param {string|null} constituencyName - Name of constituency this ward is in
 * @returns {Object} Ward profile summary
 */
export function buildWardProfile(demographics, deprivation, wardElection, constituencyName) {
  const totalPop = demographics?.age?.['Total: All usual residents'] || 0;
  const over65 = (demographics?.age?.['Aged 65 to 74 years'] || 0) +
                 (demographics?.age?.['Aged 75 to 84 years'] || 0) +
                 (demographics?.age?.['Aged 85 years and over'] || 0);
  const under18 = (demographics?.age?.['Aged 4 years and under'] || 0) +
                  (demographics?.age?.['Aged 5 to 9 years'] || 0) +
                  (demographics?.age?.['Aged 10 to 15 years'] || 0) +
                  (demographics?.age?.['Aged 16 to 19 years'] || 0) * 0.5; // rough 16-17

  const whiteBritish = demographics?.ethnicity?.['White: English, Welsh, Scottish, Northern Irish or British'] || 0;
  const totalHouseholds = demographics?.tenure?.['Total: All households'] || 0;
  const owned = demographics?.tenure?.['Owned'] || 0;
  const socialRented = demographics?.tenure?.['Social rented'] || 0;

  const econTotal = demographics?.economic_activity?.['Total: All usual residents aged 16 years and over'] || 0;
  const unemployed = demographics?.economic_activity?.['Economically active (excluding full-time students): Unemployed'] ||
                     demographics?.economic_activity?.['Unemployed'] || 0;
  const retired = demographics?.economic_activity?.['Economically inactive: Retired'] || 0;

  return {
    population: totalPop,
    electorate: wardElection?.history?.[0]?.electorate || null,
    over65Pct: totalPop > 0 ? over65 / totalPop : 0,
    under18Pct: totalPop > 0 ? under18 / totalPop : 0,
    whiteBritishPct: totalPop > 0 ? whiteBritish / totalPop : 0,
    homeOwnershipPct: totalHouseholds > 0 ? owned / totalHouseholds : 0,
    socialRentedPct: totalHouseholds > 0 ? socialRented / totalHouseholds : 0,
    unemploymentPct: econTotal > 0 ? unemployed / econTotal : 0,
    retiredPct: econTotal > 0 ? retired / econTotal : 0,
    deprivation: deprivation ? {
      decile: deprivation.avg_imd_decile,
      level: deprivation.deprivation_level,
      rank: deprivation.avg_imd_rank,
      score: deprivation.avg_imd_score,
    } : null,
    archetype: classifyWardArchetype(demographics, deprivation),
    constituency: constituencyName || null,
  };
}

/**
 * Enhanced ward priority scoring with 7 weighted factors.
 * @param {Object} params - All scoring inputs
 * @returns {{ total: number, factors: Object }}
 */
export function scoreWardPriority({
  swingRequired = Infinity,
  winProbability = 0,
  swingHistory = null,
  constituencyReformPct = 0,
  electorate = 5000,
  turnout = 0.30,
  integrityScore = 100,
  redFlagCount = 0,
  hasExecRoles = false,
  whiteBritishPct = 0.5,
  over65Pct = 0.15,
  deprivationDecile = 5,
  fraudTriangleScore = 0,
  collectionRate = 97,
  dogeHighSeverityCount = 0,
}) {
  // Factor 1: Win probability (25%) — sigmoid of swing
  const winFactor = winProbability;

  // Factor 2: Reform momentum (20%) — swing trend + GE2024 %
  const trendBonus = swingHistory?.trend === 'improving' ? 0.3 :
                     swingHistory?.trend === 'stable' ? 0.1 : 0;
  const ge2024Bonus = Math.min(1, constituencyReformPct / 0.30); // normalised to 30% = max
  const momentumFactor = Math.min(1, trendBonus + ge2024Bonus * 0.7);

  // Factor 3: Electorate efficiency (10%) — smaller is easier
  const efficiencyFactor = Math.max(0, 1 - (electorate / 15000));

  // Factor 4: Turnout opportunity (10%) — low turnout = GOTV upside
  const turnoutFactor = Math.max(0, 1 - turnout);

  // Factor 5: Incumbent vulnerability (15%)
  const integrityVuln = (100 - integrityScore) / 100;
  const flagVuln = Math.min(1, redFlagCount / 5);
  const roleVuln = hasExecRoles ? 0 : 0.5;
  const vulnerabilityFactor = Math.min(1, integrityVuln * 0.4 + flagVuln * 0.3 + roleVuln * 0.3);

  // Factor 6: Demographic alignment (10%) — Reform base match
  const wbBonus = whiteBritishPct > 0.90 ? 1 : whiteBritishPct > 0.70 ? 0.5 : 0.2;
  const ageBonus = over65Pct > 0.25 ? 0.8 : over65Pct > 0.18 ? 0.5 : 0.3;
  const depBonus = deprivationDecile <= 3 ? 0.8 : deprivationDecile <= 6 ? 0.5 : 0.3;
  const demographicFactor = (wbBonus + ageBonus + depBonus) / 3;

  // Factor 7: Council dissatisfaction (10%)
  const fraudBonus = Math.min(1, fraudTriangleScore / 80);
  const collectionBonus = collectionRate < 95 ? 0.8 : collectionRate < 97 ? 0.4 : 0;
  const dogeBonus = Math.min(1, dogeHighSeverityCount / 3);
  const dissatisfactionFactor = Math.min(1, (fraudBonus + collectionBonus + dogeBonus) / 3);

  const factors = {
    winProbability: { weight: 25, value: winFactor, weighted: Math.round(winFactor * 25) },
    reformMomentum: { weight: 20, value: momentumFactor, weighted: Math.round(momentumFactor * 20) },
    efficiency: { weight: 10, value: efficiencyFactor, weighted: Math.round(efficiencyFactor * 10) },
    turnoutOpportunity: { weight: 10, value: turnoutFactor, weighted: Math.round(turnoutFactor * 10) },
    incumbentVulnerability: { weight: 15, value: vulnerabilityFactor, weighted: Math.round(vulnerabilityFactor * 15) },
    demographicAlignment: { weight: 10, value: demographicFactor, weighted: Math.round(demographicFactor * 10) },
    councilDissatisfaction: { weight: 10, value: dissatisfactionFactor, weighted: Math.round(dissatisfactionFactor * 10) },
  };

  const total = Object.values(factors).reduce((s, f) => s + f.weighted, 0);

  return { total: Math.min(100, total), factors };
}

/**
 * Generate the printable cheat sheet for a ward.
 * @param {Object} dossier - Full ward dossier
 * @returns {Object} Cheat sheet data
 */
export function generateCheatSheet(dossier) {
  if (!dossier) return null;

  // Collect all talking points
  const allPoints = [
    ...(dossier.talkingPoints?.local || []).map(p => ({ ...p, source: 'local' })),
    ...(dossier.talkingPoints?.council || []).map(p => ({ ...p, source: 'council' })),
    ...(dossier.talkingPoints?.national || []).map(p => ({ ...p, source: 'national' })),
    ...(dossier.talkingPoints?.constituency || []).map(p => ({ ...p, source: 'constituency' })),
  ];

  // Sort by priority, take top 5
  const top5 = allPoints.sort((a, b) => a.priority - b.priority).slice(0, 5);

  // Build key stats
  const p = dossier.profile || {};
  const keyStats = [];
  if (p.population) keyStats.push(`${p.population.toLocaleString()} residents`);
  if (p.over65Pct) keyStats.push(`${Math.round(p.over65Pct * 100)}% over 65`);
  if (p.whiteBritishPct) keyStats.push(`${Math.round(p.whiteBritishPct * 100)}% White British`);
  if (p.deprivation?.decile != null) keyStats.push(`IMD decile ${p.deprivation.decile}`);
  if (p.homeOwnershipPct) keyStats.push(`${Math.round(p.homeOwnershipPct * 100)}% homeowners`);
  if (p.unemploymentPct) keyStats.push(`${(p.unemploymentPct * 100).toFixed(1)}% unemployment`);

  // Do-not-say warnings
  const doNotSay = [];
  if (p.whiteBritishPct < 0.70) {
    doNotSay.push('Diverse ward — avoid strong immigration language. Focus on community cohesion.');
  }
  if (p.deprivation?.decile >= 8) {
    doNotSay.push('Affluent ward — avoid poverty/deprivation framing. Focus on value for money.');
  }
  if (p.over65Pct > 0.30) {
    doNotSay.push('Heavily retired ward — avoid tech-first messaging. Focus on personal contact.');
  }

  // Target line
  const defenderParty = dossier.election?.defender?.party || 'Unknown';
  const target = `${defenderParty} → ${dossier.ourParty || 'Reform UK'}`;

  return {
    wardName: dossier.ward,
    electionDate: dossier.electionDate || 'TBC',
    target,
    swingNeeded: dossier.election?.prediction?.swingRequired != null
      ? `${dossier.election.prediction.swingRequired > 0 ? '+' : ''}${(dossier.election.prediction.swingRequired * 100).toFixed(1)}pp`
      : 'N/A',
    classification: dossier.election?.classification || {},
    overallScore: dossier.overallScore || 0,
    keyStats,
    top5TalkingPoints: top5,
    doNotSay,
    defenderName: dossier.election?.defender?.name || 'Unknown',
    defenderParty,
    councillorCount: dossier.councillors?.length || 0,
  };
}

/**
 * Master function: generate a complete ward dossier from all available data.
 * @param {string} wardName - Ward name
 * @param {Object} allData - All loaded data sources
 * @param {string} ourParty - Party we're strategising for
 * @returns {Object} Complete ward dossier
 */
export function generateWardDossier(wardName, allData, ourParty = 'Reform UK') {
  const {
    electionsData, referenceData, politicsSummary,
    demographicsData, deprivationData,
    councillorsData, integrityData, interestsData,
    dogeFindings, budgetSummary, collectionRates,
    constituenciesData, wardConstituencyMap,
    councilPrediction, rankedWard, meetingsData,
    propertyAssets,
  } = allData;

  const wardElection = electionsData?.wards?.[wardName] || null;
  const defenders = electionsData?.meta?.next_election?.defenders || electionsData?.next_election?.defenders || {};
  const defender = defenders[wardName] || null;

  // Demographics lookup
  const demoByName = {};
  if (demographicsData?.wards) {
    for (const [, val] of Object.entries(demographicsData.wards)) {
      if (val?.name) demoByName[val.name] = val;
    }
  }
  const demo = demoByName[wardName] || null;
  const deprivation = deprivationData?.wards?.[wardName] || null;

  // Constituency lookup
  const wardMapping = wardConstituencyMap?.[wardName];
  const constituencyName = wardMapping?.constituency_name || wardMapping?.PCON24NM || null;
  const constituencies = constituenciesData?.constituencies || [];
  const constituency = constituencyName
    ? constituencies.find(c => c.name === constituencyName)
    : (constituencies.length === 1 ? constituencies[0] : null);

  // Build profile
  const profile = buildWardProfile(demo, deprivation, wardElection, constituencyName || constituency?.name);

  // Election intel
  const pred = councilPrediction?.wards?.[wardName] || null;
  const classification = pred ? classifyWard(pred, ourParty, defender?.party) : null;
  const swingReq = pred ? calculateSwingRequired(pred, ourParty) : Infinity;
  const winProb = pred ? 1 / (1 + Math.exp(swingReq * 15)) : 0;
  const swingHist = calculateSwingHistory(wardElection, ourParty);

  const election = {
    defender,
    allHolders: wardElection?.current_holders || [],
    prediction: pred ? {
      winner: pred.winner,
      ourPct: pred.prediction?.[ourParty]?.pct || 0,
      swingRequired: swingReq,
      winProbability: winProb,
      confidence: pred.confidence,
      fullPrediction: pred.prediction,
    } : null,
    classification,
    history: swingHist.swings,
    trend: swingHist.trend,
    avgSwing: swingHist.avgSwing,
    volatility: swingHist.volatility,
  };

  // Councillor dossiers
  const allCouncillors = councillorsData || [];
  const cList = Array.isArray(allCouncillors) ? allCouncillors : allCouncillors.councillors || [];
  const wardCouncillors = cList.filter(c => c.ward === wardName);
  const integrityList = integrityData?.councillors || [];
  const interestsList = interestsData?.councillors || {};

  const councillors = wardCouncillors.map(c => {
    const integ = integrityList.find(i => i.councillor_id === c.id || i.name === c.name);
    const interests = typeof interestsList === 'object' && !Array.isArray(interestsList)
      ? interestsList[c.id] || Object.values(interestsList).find(i => i.name === c.name)
      : null;
    return {
      name: c.name,
      party: c.party,
      isDefender: defender?.name === c.name,
      roles: c.roles || [],
      integrity: integ ? {
        score: integ.integrity_score,
        riskLevel: integ.risk_level,
        redFlags: integ.red_flags || [],
        directorships: integ.total_directorships || 0,
      } : null,
      interests: interests ? {
        companies: interests.declared_companies || [],
        employment: interests.declared_employment || [],
        land: interests.declared_land || [],
        securities: (interests.declared_securities || []).filter(s => s && s.toLowerCase() !== 'no'),
      } : null,
      attackLines: generateAttackLines(c, integ, interests),
    };
  });

  // Council performance
  const councilPerformance = {
    politicalControl: politicsSummary?.coalition
      ? `${politicsSummary.coalition.majority ? politicsSummary.coalition.parties?.join('/') + ' majority' : politicsSummary.coalition.type || 'NOC'}`
      : 'Unknown',
    fraudTriangleScore: dogeFindings?.fraud_triangle?.overall_score || null,
    topFindings: (dogeFindings?.findings || []).filter(f => f.severity === 'critical' || f.severity === 'warning').slice(0, 5),
    collectionRate: collectionRates ? {
      latest: collectionRates.latest_rate,
      trend: collectionRates.trend_direction,
      fiveYearAvg: collectionRates.five_year_avg,
    } : null,
    reserves: budgetSummary?.reserves ? {
      totalClosing: budgetSummary.reserves.total_closing,
      change: (budgetSummary.reserves.total_closing || 0) - (budgetSummary.reserves.total_opening || 0),
    } : null,
    councilTaxBandD: (() => {
      const bdy = budgetSummary?.council_tax?.band_d_by_year;
      if (!bdy) return null;
      const years = Object.keys(bdy).sort();
      return bdy[years[years.length - 1]] || null;
    })(),
    attackLines: generateCouncilAttackLines(dogeFindings, budgetSummary, collectionRates, politicsSummary),
  };

  // Constituency context
  const constituencyContext = constituency ? {
    name: constituency.name,
    mp: constituency.mp ? { name: constituency.mp.name, party: constituency.mp.party } : null,
    ge2024: constituency.ge2024 || null,
    mpExpenses: constituency.mp?.expenses ? {
      total: constituency.mp.expenses.total_claimed,
      rank: constituency.mp.expenses.rank_of_650,
    } : null,
    votingRecord: constituency.voting_record || null,
    claimantCount: constituency.claimant_count || null,
  } : null;

  // Talking points — categorised
  const localPoints = generateTalkingPoints(wardElection, demo, deprivation, pred);
  const assetPoints = generateAssetTalkingPoints(wardName, propertyAssets);
  const councilAttack = councilPerformance.attackLines.map(a => ({
    priority: a.severity === 'high' ? 1 : a.severity === 'medium' ? 2 : 3,
    category: a.category || 'Council',
    icon: 'AlertTriangle',
    text: a.text,
  }));
  const nationalPoints = generateNationalLines(constituency, demo, deprivation, ourParty);
  const constituencyPoints = nationalPoints.filter(p => p.category === 'Constituency');
  const pureNational = nationalPoints.filter(p => p.category === 'National');

  const talkingPoints = {
    local: [...localPoints, ...assetPoints],
    council: councilAttack,
    national: pureNational,
    constituency: constituencyPoints,
  };

  // Reform GE2024 constituency %
  const reformGE = constituency?.ge2024?.results?.find(r => /reform/i.test(r.party || ''));
  const constituencyReformPct = reformGE?.pct || 0;

  // Scoring
  const defenderCouncillor = councillors.find(c => c.isDefender);
  const scoring = scoreWardPriority({
    swingRequired: swingReq,
    winProbability: winProb,
    swingHistory: swingHist,
    constituencyReformPct,
    electorate: wardElection?.history?.[0]?.electorate || profile.population || 5000,
    turnout: wardElection?.history?.[0]?.turnout || 0.30,
    integrityScore: defenderCouncillor?.integrity?.score ?? 100,
    redFlagCount: defenderCouncillor?.integrity?.redFlags?.length || 0,
    hasExecRoles: defenderCouncillor?.roles?.length > 0,
    whiteBritishPct: profile.whiteBritishPct,
    over65Pct: profile.over65Pct,
    deprivationDecile: profile.deprivation?.decile || 5,
    fraudTriangleScore: councilPerformance.fraudTriangleScore || 0,
    collectionRate: councilPerformance.collectionRate?.latest || 97,
    dogeHighSeverityCount: (dogeFindings?.findings || []).filter(f => f.severity === 'critical').length,
  });

  const electionDate = electionsData?.meta?.next_election?.date || null;

  // Property summary for this ward
  const propertySummary = generatePropertySummary(wardName, propertyAssets);

  const dossier = {
    ward: wardName,
    ourParty,
    overallScore: scoring.total,
    scoringFactors: scoring.factors,
    electionDate,
    profile,
    election,
    councillors,
    councilPerformance,
    constituency: constituencyContext,
    talkingPoints,
    propertySummary,
  };

  // Add cheat sheet
  dossier.cheatSheet = generateCheatSheet(dossier);

  return dossier;
}


// ============================================================================
// Phase 18e — Geographic + Route Optimisation Functions
// ============================================================================

/**
 * Haversine distance between two [lng, lat] centroids in km.
 */
function haversineDistance(a, b) {
  const R = 6371;
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLng = (b[0] - a[0]) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat +
    Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Nearest-neighbor ordering of indices given a distance matrix.
 * Returns ordered array of indices starting from startIdx.
 */
function nearestNeighborOrder(indices, distMatrix, startIdx = 0) {
  if (indices.length <= 1) return [...indices];
  const remaining = new Set(indices);
  const order = [startIdx];
  remaining.delete(startIdx);

  while (remaining.size > 0) {
    const current = order[order.length - 1];
    let nearest = null;
    let nearestDist = Infinity;
    for (const idx of remaining) {
      const d = distMatrix[current]?.[idx] ?? Infinity;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = idx;
      }
    }
    if (nearest == null) break;
    order.push(nearest);
    remaining.delete(nearest);
  }
  return order;
}

/**
 * Extract ward centroids from ward_boundaries.json GeoJSON.
 * Returns Map: wardName → [lng, lat]
 */
export function computeWardCentroids(boundaries) {
  const centroids = new Map();
  if (!boundaries?.features) return centroids;

  for (const feature of boundaries.features) {
    const name = feature.properties?.name;
    const centroid = feature.properties?.centroid;
    if (name && centroid && centroid.length === 2) {
      centroids.set(name, centroid);
    }
  }
  return centroids;
}

/**
 * Cluster contested wards into canvassing sessions by geographic proximity.
 * Uses k-means clustering on ward centroids.
 *
 * @param {Map} centroids — wardName → [lng, lat]
 * @param {string[]} wardsUp — contested ward names
 * @param {number} maxPerCluster — target max wards per session (default 4)
 * @returns {Array<{ wards: string[], centroid: number[], color: string }>}
 */
export function clusterWards(centroids, wardsUp, maxPerCluster = 4) {
  const CLUSTER_COLORS = [
    '#12B6CF', '#f97316', '#a855f7', '#22c55e',
    '#f43f5e', '#facc15', '#6366f1', '#14b8a6',
    '#e879f9', '#84cc16', '#f59e0b', '#8b5cf6',
  ];

  // Filter to wards with centroids
  const wards = wardsUp.filter(w => centroids.has(w));
  if (wards.length === 0) return [];
  if (wards.length <= maxPerCluster) {
    return [{
      wards,
      centroid: [
        wards.reduce((s, w) => s + centroids.get(w)[0], 0) / wards.length,
        wards.reduce((s, w) => s + centroids.get(w)[1], 0) / wards.length,
      ],
      color: CLUSTER_COLORS[0],
    }];
  }

  const k = Math.ceil(wards.length / maxPerCluster);
  const points = wards.map(w => centroids.get(w));

  // Initialise k-means centroids evenly spaced from ward list
  let means = Array.from({ length: k }, (_, i) => {
    const idx = Math.floor(i * points.length / k);
    return [...points[idx]];
  });

  // Run k-means (max 20 iterations with convergence check)
  let assignments = new Array(wards.length).fill(0);
  for (let iter = 0; iter < 20; iter++) {
    // Assign each ward to nearest mean
    const prevAssignments = [...assignments];
    for (let i = 0; i < wards.length; i++) {
      let minDist = Infinity;
      let minK = 0;
      for (let j = 0; j < k; j++) {
        const d = haversineDistance(points[i], means[j]);
        if (d < minDist) { minDist = d; minK = j; }
      }
      assignments[i] = minK;
    }

    // Check convergence
    if (iter > 0 && assignments.every((a, i) => a === prevAssignments[i])) break;

    // Update means
    const sums = Array.from({ length: k }, () => [0, 0, 0]); // [sumLng, sumLat, count]
    for (let i = 0; i < wards.length; i++) {
      const c = assignments[i];
      sums[c][0] += points[i][0];
      sums[c][1] += points[i][1];
      sums[c][2]++;
    }
    for (let j = 0; j < k; j++) {
      if (sums[j][2] > 0) {
        means[j] = [sums[j][0] / sums[j][2], sums[j][1] / sums[j][2]];
      }
    }
  }

  // Build clusters
  const clusters = Array.from({ length: k }, (_, i) => ({
    wards: [],
    centroid: means[i],
    color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
  }));
  for (let i = 0; i < wards.length; i++) {
    clusters[assignments[i]].wards.push(wards[i]);
  }

  // Remove empty clusters
  return clusters.filter(c => c.wards.length > 0);
}

/**
 * Optimise canvassing route: order clusters by proximity,
 * order wards within each cluster by nearest-neighbor.
 *
 * @param {Array} clusters — from clusterWards()
 * @param {Map} centroids — wardName → [lng, lat]
 * @param {object} resourceAllocation — wardName → { hours }
 * @returns {{ sessions: Array, routeLines: Array }}
 */
export function optimiseCanvassingRoute(clusters, centroids, resourceAllocation = {}) {
  if (!clusters.length) return { sessions: [], routeLines: [] };

  // Build inter-cluster distance matrix
  const clusterDist = {};
  for (let i = 0; i < clusters.length; i++) {
    clusterDist[i] = {};
    for (let j = 0; j < clusters.length; j++) {
      clusterDist[i][j] = haversineDistance(clusters[i].centroid, clusters[j].centroid);
    }
  }

  // Order clusters by nearest-neighbor from cluster 0
  const clusterOrder = nearestNeighborOrder(
    clusters.map((_, i) => i), clusterDist, 0
  );

  const sessions = [];
  const routeLines = [];
  let prevCentroid = null;

  for (const ci of clusterOrder) {
    const cluster = clusters[ci];
    const wardNames = cluster.wards;

    // Build intra-cluster distance matrix
    const wardDist = {};
    for (let i = 0; i < wardNames.length; i++) {
      wardDist[i] = {};
      for (let j = 0; j < wardNames.length; j++) {
        wardDist[i][j] = haversineDistance(
          centroids.get(wardNames[i]), centroids.get(wardNames[j])
        );
      }
    }

    // Order wards within cluster by nearest-neighbor
    const wardIndices = wardNames.map((_, i) => i);
    const orderedIndices = nearestNeighborOrder(wardIndices, wardDist, 0);
    const orderedWards = orderedIndices.map(i => wardNames[i]);

    // Calculate session stats
    let totalHours = 0;
    const wardDetails = orderedWards.map((w, visitOrder) => {
      const alloc = resourceAllocation[w];
      const hours = alloc?.hours || alloc?.totalHours || 4;
      totalHours += hours;
      return {
        ward: w,
        visitOrder: visitOrder + 1,
        centroid: centroids.get(w),
        hours,
        roi: alloc?.roi || 'medium',
      };
    });

    sessions.push({
      sessionNumber: sessions.length + 1,
      wards: wardDetails,
      totalHours,
      estimatedBlocks: Math.ceil(totalHours / 4),
      color: cluster.color,
      clusterCentroid: cluster.centroid,
    });

    // Connect from previous cluster's last ward FIRST (inter-cluster link)
    if (prevCentroid) {
      const firstInCluster = centroids.get(orderedWards[0]);
      if (firstInCluster) routeLines.push([prevCentroid, firstInCluster]);
    }

    // Then build intra-cluster route lines between consecutive wards
    for (let i = 0; i < orderedWards.length - 1; i++) {
      const from = centroids.get(orderedWards[i]);
      const to = centroids.get(orderedWards[i + 1]);
      if (from && to) routeLines.push([from, to]);
    }
    prevCentroid = centroids.get(orderedWards[orderedWards.length - 1]);
  }

  return { sessions, routeLines };
}

/**
 * Generate canvassing CSV export.
 *
 * @param {Array} sessions — from optimiseCanvassingRoute()
 * @param {string} ourParty
 * @param {string} councilName
 * @returns {string} CSV content
 */
export function generateCanvassingCSV(sessions, ourParty, councilName) {
  const rows = ['Session,Visit Order,Ward,Latitude,Longitude,Hours,ROI,Est 4hr Blocks'];

  for (const session of sessions) {
    for (const ward of session.wards) {
      const lat = ward.centroid?.[1]?.toFixed(6) || '';
      const lng = ward.centroid?.[0]?.toFixed(6) || '';
      rows.push([
        session.sessionNumber,
        ward.visitOrder,
        `"${ward.ward.replace(/"/g, '""')}"`,
        lat,
        lng,
        ward.hours,
        ward.roi,
        session.estimatedBlocks,
      ].join(','));
    }
  }

  // Metadata row (valid CSV — empty fields except Ward column for notes)
  rows.push('');
  const totalHours = sessions.reduce((s, sess) => s + sess.totalHours, 0);
  rows.push(`,,${ourParty} Canvassing Plan — ${councilName},,,,`);
  rows.push(`,,Generated ${new Date().toISOString().split('T')[0]} | ${sessions.length} sessions | ${totalHours} hours,,,,`);

  return rows.join('\n');
}
