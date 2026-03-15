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

import { financialHealthAssessment } from './savingsEngine'

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
  target: { label: 'Target', color: '#12B6CF', priority: 2 },
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
function calculateSwingRequired(wardPrediction, ourParty) {
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
 * Generate talking points based on HMO (Houses in Multiple Occupation) data for a ward.
 * @param {string} wardName - Ward name
 * @param {Object|null} hmoData - hmo.json data for the council
 * @returns {Array<{ category: string, icon: string, priority: number, text: string }>}
 */
export function generateHMOTalkingPoints(wardName, hmoData) {
  const points = [];
  if (!wardName || !hmoData) return points;

  const wardCount = hmoData.by_ward?.[wardName] || 0;
  const totalHMOs = hmoData.summary?.total_licensed || 0;
  const totalBedSpaces = hmoData.summary?.total_bed_spaces || 0;

  if (wardCount > 0) {
    const wardPct = totalHMOs > 0 ? Math.round((wardCount / totalHMOs) * 100) : 0;
    points.push({
      category: 'Housing',
      icon: 'Building',
      priority: wardCount > 10 ? 1 : 2,
      text: `${wardCount} licensed HMOs in this ward (${wardPct}% of council total). ${wardCount > 10 ? 'High concentration — housing standards enforcement, parking pressure, community impact.' : 'Monitor standards and overcrowding.'}`,
    });
  }

  // Planning applications for HMOs
  const planningApps = hmoData.planning_applied?.[wardName] || 0;
  const planningRefused = hmoData.planning_refused?.[wardName] || 0;
  if (planningApps > 0) {
    points.push({
      category: 'Housing',
      icon: 'AlertTriangle',
      priority: 2,
      text: `${planningApps} HMO planning applications in this ward${planningRefused > 0 ? ` (${planningRefused} refused)` : ''}. Residents likely concerned about further HMO creep.`,
    });
  }

  // Council-wide context
  if (totalBedSpaces > 500 && wardCount > 5) {
    points.push({
      category: 'Housing',
      icon: 'Users',
      priority: 3,
      text: `Council-wide: ${totalHMOs} licensed HMOs with ${totalBedSpaces.toLocaleString()} bed spaces. Ask: is the council enforcing licensing? How many unlicensed HMOs?`,
    });
  }

  // Modelling data (estimated HMOs from council modelling)
  const modelling = hmoData.modelling;
  if (modelling?.hotspot_wards?.length) {
    const wardModelling = modelling.hotspot_wards.find(w => w.ward === wardName);
    if (wardModelling && wardModelling.estimated_hmos > 20) {
      points.push({
        category: 'Housing',
        icon: 'Building',
        priority: wardModelling.risk_level === 'high' ? 1 : 2,
        text: `Council modelling estimates ${wardModelling.estimated_hmos} HMOs in this ward (${wardModelling.pct_of_ward_stock}% of stock). ${wardModelling.risk_level === 'high' ? 'HIGH concentration — housing quality, anti-social behaviour, parking pressure, transient populations are key local issues.' : 'Article 4 Direction applies — new HMO conversions need planning permission.'}`,
      });
    }
    if (modelling.estimated_total_hmos > 500 && !wardModelling) {
      points.push({
        category: 'Housing',
        icon: 'MapPin',
        priority: 3,
        text: `Council-wide: an estimated ${modelling.estimated_total_hmos.toLocaleString()} HMOs (${modelling.pct_of_housing_stock}% of stock). Inner wards bear the heaviest concentration.`,
      });
    }
  }

  return points;
}

/**
 * Generate talking points based on demographic fiscal risk data for a ward.
 * @param {Object|null} fiscalData - demographic_fiscal.json data
 * @param {Object|null} deprivation - Ward deprivation data
 * @returns {Array<{ category: string, icon: string, priority: number, text: string }>}
 */
export function generateFiscalTalkingPoints(fiscalData, deprivation) {
  const points = [];
  if (!fiscalData) return points;

  // Fiscal resilience score
  const resilience = fiscalData.fiscal_resilience_score;
  if (resilience != null) {
    if (resilience < 40) {
      points.push({
        category: 'Fiscal',
        icon: 'AlertTriangle',
        priority: 1,
        text: `Council fiscal resilience score: ${resilience}/100 (poor). At risk of section 114 notice. Highlight: financial mismanagement, reserves depletion, unsustainable borrowing.`,
      });
    } else if (resilience < 60) {
      points.push({
        category: 'Fiscal',
        icon: 'TrendingDown',
        priority: 2,
        text: `Council fiscal resilience score: ${resilience}/100 (concerning). Challenge: why are reserves declining? What's the plan for financial sustainability?`,
      });
    }
  }

  // SEND risk
  const sendRisk = fiscalData.send_risk;
  if (sendRisk && sendRisk.exposure_level === 'high') {
    points.push({
      category: 'Fiscal',
      icon: 'GraduationCap',
      priority: 2,
      text: `High SEND exposure — demand for special educational needs services exceeds budget capacity. Parents report delays and inadequate provision.`,
    });
  }

  // Asylum impact
  const asylum = fiscalData.asylum_impact;
  if (asylum && (asylum.cost_per_capita > 50 || asylum.dispersal_rate > 3)) {
    points.push({
      category: 'Fiscal',
      icon: 'Globe',
      priority: 1,
      text: `Asylum dispersal: ${asylum.dispersal_rate?.toFixed(1) || '?'}/1000 population. Estimated cost: £${Math.round((asylum.cost_per_capita || 0) * (asylum.population || 0) / 1000)}k/year. Challenge: what additional services funding has the council secured?`,
    });
  }

  // Service demand pressure
  const demand = fiscalData.service_demand;
  if (demand) {
    const pressures = [];
    if (demand.social_care_pressure > 0.7) pressures.push('social care');
    if (demand.childrens_services_pressure > 0.7) pressures.push("children's services");
    if (demand.housing_pressure > 0.7) pressures.push('housing');
    if (pressures.length > 0) {
      points.push({
        category: 'Fiscal',
        icon: 'TrendingUp',
        priority: 2,
        text: `High demand pressure on: ${pressures.join(', ')}. Council may be cutting corners or building waiting lists.`,
      });
    }
  }

  // Threat analysis
  const threats = fiscalData.threat_analysis;
  if (threats?.length > 0) {
    const topThreat = threats[0];
    points.push({
      category: 'Fiscal',
      icon: 'Swords',
      priority: 2,
      text: `Top fiscal threat: ${topThreat.threat || topThreat.description || 'budgetary pressure'}. Impact: ${topThreat.impact || 'significant'}. Challenge the administration on preparedness.`,
    });
  }

  return points;
}

/**
 * Generate talking points based on council meetings data.
 * @param {string} wardName - Ward name
 * @param {Object|null} meetingsData - meetings.json data
 * @param {Array|null} wardCouncillors - Councillors for this ward
 * @returns {Array<{ category: string, icon: string, priority: number, text: string }>}
 */
function generateMeetingsTalkingPoints(wardName, meetingsData, wardCouncillors) {
  const points = [];
  if (!meetingsData?.meetings) return points;

  const totalMeetings = meetingsData.meetings.length;
  if (totalMeetings > 0) {
    // Check for councillor meeting attendance (if attendance data available)
    if (wardCouncillors?.length > 0) {
      for (const c of wardCouncillors) {
        const attendanceRecords = meetingsData.attendance?.[c.name] || meetingsData.attendance?.[c.id];
        if (attendanceRecords) {
          const attended = attendanceRecords.attended || 0;
          const total = attendanceRecords.total || totalMeetings;
          const rate = total > 0 ? attended / total : 0;
          if (rate < 0.5) {
            points.push({
              category: 'Accountability',
              icon: 'AlertTriangle',
              priority: 1,
              text: `Councillor ${c.name} attended only ${attended} of ${total} meetings (${Math.round(rate * 100)}%). Are they representing this ward properly?`,
            });
          } else if (rate < 0.75) {
            points.push({
              category: 'Accountability',
              icon: 'Users',
              priority: 2,
              text: `Councillor ${c.name}: ${Math.round(rate * 100)}% meeting attendance (${attended}/${total}). Below council average.`,
            });
          }
        }
      }
    }

    // Committee diversity
    const committees = [...new Set(meetingsData.meetings.map(m => m.committee).filter(Boolean))];
    if (committees.length > 0) {
      points.push({
        category: 'Governance',
        icon: 'Users',
        priority: 3,
        text: `${totalMeetings} council meetings across ${committees.length} committees. Ask: are scrutiny committees effective? Are decisions rubber-stamped?`,
      });
    }
  }

  return points;
}

/**
 * Generate talking points based on national polling context.
 * @param {Object|null} pollingData - polling.json data
 * @param {string} ourParty - The party we're strategising for
 * @returns {Array<{ category: string, icon: string, priority: number, text: string }>}
 */
function generatePollingTalkingPoints(pollingData, ourParty) {
  const points = [];
  if (!pollingData?.aggregate) return points;

  const ourShare = pollingData.aggregate[ourParty];
  const trend = pollingData.trend_30d?.[ourParty];

  if (ourShare != null) {
    const pct = Math.round(ourShare * 1000) / 10;
    let trendText = '';
    if (trend != null && Math.abs(trend) > 0.005) {
      const dir = trend > 0 ? 'up' : 'down';
      trendText = ` — trending ${dir} ${Math.abs(Math.round(trend * 1000) / 10)}pp in last 30 days`;
    }
    points.push({
      category: 'National',
      icon: trend > 0 ? 'TrendingUp' : trend < -0.005 ? 'TrendingDown' : 'Target',
      priority: 2,
      text: `${ourParty} polling nationally at ${pct}%${trendText}. ${pct > 25 ? 'Strong national headwind — leverage on doorstep.' : 'Build local case — national brand less helpful here.'}`,
    });
  }

  // Leading party context
  const sorted = Object.entries(pollingData.aggregate).sort((a, b) => b[1] - a[1]);
  if (sorted.length >= 2) {
    const [leader, leaderShare] = sorted[0];
    const gap = Math.round((leaderShare - (ourShare || 0)) * 1000) / 10;
    if (leader !== ourParty) {
      points.push({
        category: 'National',
        icon: 'Swords',
        priority: 3,
        text: `${leader} leads nationally at ${Math.round(leaderShare * 1000) / 10}% (${gap}pp ahead of ${ourParty}). Frame local contest as change vs. more of the same.`,
      });
    }
  }

  // Swing from GE2024
  const swing = pollingData.swing_from_ge2024?.[ourParty];
  if (swing != null && Math.abs(swing) > 0.02) {
    const dir = swing > 0 ? 'gained' : 'lost';
    const pp = Math.abs(Math.round(swing * 1000) / 10);
    points.push({
      category: 'National',
      icon: swing > 0 ? 'TrendingUp' : 'TrendingDown',
      priority: swing > 0 ? 2 : 1,
      text: `${ourParty} has ${dir} ${pp}pp since GE2024. ${swing > 0 ? 'Momentum — remind voters of the direction of travel.' : 'Counter-narrative needed — focus on local achievements and candidate quality.'}`,
    });
  }

  return points;
}

/**
 * Generate talking points based on LCC property/land assets in a ward/CED.
 * @param {string} cedName - CED or ward name
 * @param {Array} propertyAssets - Array of asset objects from property_assets.json
 * @returns {Array<{ category: string, icon: string, priority: number, text: string }>}
 */
function generateAssetTalkingPoints(cedName, propertyAssets) {
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

  // Sellable assets (LCC can direct sale as majority shareholder)
  const sellable = wardAssets.filter(a => a.sellable_by_lcc);
  const nonSellable = wardAssets.filter(a => a.sellable_by_lcc === false);
  if (sellable.length > 0 && nonSellable.length > 0) {
    points.push({
      category: 'Property',
      icon: 'TrendingUp',
      priority: 2,
      text: `${sellable.length} of ${wardAssets.length} assets sellable by LCC (including subsidiaries via board resolution). ${nonSellable.length} require third-party agreement.`,
    });
  }

  return points;
}

/**
 * Generate talking points based on planning application data in a ward.
 * @param {string} wardName - Ward name
 * @param {Object} planningData - planning.json data for the council
 * @returns {Array<{ category: string, icon: string, priority: number, text: string }>}
 */
function generatePlanningTalkingPoints(wardName, planningData) {
  const points = [];
  if (!wardName || !planningData?.summary?.by_ward) return points;

  const wardApps = planningData.summary.by_ward[wardName] || 0;
  if (wardApps === 0) return points;

  const totalApps = planningData.summary.total || 1;
  const wardPct = Math.round((wardApps / totalApps) * 100);

  points.push({
    category: 'Planning',
    icon: 'Building',
    priority: wardApps > 50 ? 2 : 3,
    text: `${wardApps} planning applications (${wardPct}% of council total). ${wardApps > 50 ? 'High development pressure — community concern likely.' : 'Moderate development activity.'}`,
  });

  // Planning efficiency context
  const efficiency = planningData.efficiency;
  if (efficiency?.cost_per_application) {
    points.push({
      category: 'Planning',
      icon: 'PoundSterling',
      priority: 3,
      text: `Planning costs £${efficiency.cost_per_application.toLocaleString()} per application (${efficiency.budget_year}). Potential LGR consolidation savings.`,
    });
  }

  // Approval rate context
  const approvalRate = planningData.summary.approval_rate;
  if (approvalRate != null) {
    const pct = Math.round(approvalRate * 100);
    if (pct < 70) {
      points.push({
        category: 'Planning',
        icon: 'AlertTriangle',
        priority: 2,
        text: `Low approval rate (${pct}%) — residents may feel planning process is broken or obstructive.`,
      });
    }
  }

  // Cross-references: planning on council land
  const propMatches = planningData.cross_references?.property_matches;
  if (propMatches?.length > 0) {
    const wardMatches = propMatches.filter(m =>
      m.application?.ward === wardName
    );
    if (wardMatches.length > 0) {
      points.push({
        category: 'Planning',
        icon: 'Target',
        priority: 1,
        text: `${wardMatches.length} planning application${wardMatches.length !== 1 ? 's' : ''} within 100m of council-owned assets — potential disposal/development coordination opportunity.`,
      });
    }
  }

  return points;
}

/**
 * Generate a property summary object for a ward dossier.
 * @param {string} wardName - CED or ward name
 * @param {Array} propertyAssets - Array of asset objects from property_assets.json
 * @returns {Object|null} Summary object or null if no assets
 */
function generatePropertySummary(wardName, propertyAssets) {
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

// ---------------------------------------------------------------------------
// Housing Talking Points (from housing.json)
// ---------------------------------------------------------------------------

/**
 * Generate housing-specific talking points from housing.json ward data.
 */
export function generateHousingTalkingPoints(wardName, housingData) {
  const points = []
  if (!housingData?.wards) return points
  const ward = housingData.wards[wardName] || Object.values(housingData.wards).find(w => w?.name === wardName)
  if (!ward) return points

  const tenure = ward.tenure || {}
  const totalHouseholds = tenure['Total: All households'] || tenure['Total'] || 0
  if (totalHouseholds === 0) return points

  const socialRented = (tenure['Social rented: Rents from council (Local Authority)'] || 0) +
    (tenure['Social rented: Other social rented'] || 0)
  const privateRented = tenure['Private rented: Private landlord or letting agency'] || 0
  const owned = (tenure['Owned: Owns outright'] || 0) + (tenure['Owned: Owns with a mortgage or loan'] || 0)
  const socialPct = socialRented / totalHouseholds
  const privatePct = privateRented / totalHouseholds
  const ownedPct = owned / totalHouseholds

  if (socialPct > 0.25) {
    points.push({
      category: 'Housing', icon: 'Building', priority: 1,
      text: `${Math.round(socialPct * 100)}% social housing. High dependency on council provision — pitch maintenance, allocations fairness, Right to Buy reform.`,
    })
  } else if (socialPct > 0.15) {
    points.push({
      category: 'Housing', icon: 'Building', priority: 2,
      text: `${Math.round(socialPct * 100)}% social housing. Waiting lists, repairs, and estate management resonate here.`,
    })
  }

  if (privatePct > 0.25) {
    points.push({
      category: 'Housing', icon: 'Home', priority: 2,
      text: `${Math.round(privatePct * 100)}% private rented. Renters concerned about costs, security, landlord standards. HMO enforcement relevant.`,
    })
  }

  if (ownedPct > 0.75) {
    points.push({
      category: 'Housing', icon: 'Home', priority: 3,
      text: `${Math.round(ownedPct * 100)}% homeowners. Property values, planning decisions, neighbourhood character matter most.`,
    })
  }

  // Overcrowding
  const overcrowded = ward.overcrowding || {}
  const totalOccupancy = overcrowded['Total: All household spaces with at least one usual resident'] || 0
  const overcrowdedCount = (overcrowded['Occupancy rating of rooms: -1'] || 0) + (overcrowded['Occupancy rating of rooms: -2 or less'] || 0)
  if (totalOccupancy > 0 && overcrowdedCount / totalOccupancy > 0.08) {
    points.push({
      category: 'Housing', icon: 'AlertTriangle', priority: 1,
      text: `${Math.round(overcrowdedCount / totalOccupancy * 100)}% overcrowded. Housing crisis visible on doorsteps — new builds, conversions, and allocation policy key.`,
    })
  }

  // Homelessness data (council-wide, adds context for all wards)
  const homelessness = housingData?.homelessness
  if (homelessness) {
    if (homelessness.enquiries?.total > 1000) {
      points.push({
        category: 'Housing', icon: 'AlertTriangle', priority: 1,
        text: `${homelessness.enquiries.total.toLocaleString()} homelessness enquiries (${homelessness.enquiries.period || homelessness.period}). ${homelessness.active_cases?.total || 0} active cases. Rough sleeping up ${homelessness.rough_sleeping?.change_pct || 0}%. Housing crisis is real and worsening.`,
      })
    }
    if (homelessness.waiting_list?.households > 2000) {
      points.push({
        category: 'Housing', icon: 'Users', priority: 2,
        text: `${homelessness.waiting_list.households.toLocaleString()} on housing waiting list. Social housing demand far outstrips supply — pitch allocation reform, empty homes conversion.`,
      })
    }
  }

  // Housing pressure data
  const pressure = housingData?.housing_pressure
  if (pressure) {
    if (pressure.empty_homes?.total > 500) {
      points.push({
        category: 'Housing', icon: 'Building', priority: 2,
        text: `${pressure.empty_homes.total.toLocaleString()} empty homes (${pressure.empty_homes.long_term_vacant || 0} long-term vacant) while ${homelessness?.waiting_list?.households?.toLocaleString() || 'thousands'} wait. Empty homes levy and compulsory purchase orders resonate strongly.`,
      })
    }
    if (pressure.lha_gap?.monthly_shortfall > 50) {
      points.push({
        category: 'Housing', icon: 'TrendingUp', priority: 2,
        text: `LHA shortfall of £${pressure.lha_gap.monthly_shortfall}/month on ${pressure.lha_gap.benchmark} benchmark. Tenants forced to top up from benefits. Average rent £${pressure.private_rent?.average_monthly}/mo (+${pressure.private_rent?.yoy_change_pct}% YoY).`,
      })
    }
  }

  return points.sort((a, b) => a.priority - b.priority)
}

// ---------------------------------------------------------------------------
// Economy & Work Talking Points (from economy.json)
// ---------------------------------------------------------------------------

/**
 * Generate economy-specific talking points from economy.json ward data.
 */
export function generateEconomyTalkingPoints(wardName, economyData) {
  const points = []
  if (!economyData) return points

  // Ward-level claimant count
  const wardClaimants = economyData.ward_claimants?.find(w => w.ward_name === wardName || w.name === wardName)
  if (wardClaimants) {
    const rate = wardClaimants.claimant_rate || (wardClaimants.claimant_count / (wardClaimants.population_16_64 || 1))
    if (rate > 0.06) {
      points.push({
        category: 'Economy', icon: 'TrendingDown', priority: 1,
        text: `${wardClaimants.claimant_count?.toLocaleString() || '?'} benefit claimants (${(rate * 100).toFixed(1)}%). Jobs, skills, and welfare reform are urgent doorstep issues.`,
      })
    } else if (rate > 0.03) {
      points.push({
        category: 'Economy', icon: 'Briefcase', priority: 2,
        text: `${wardClaimants.claimant_count?.toLocaleString() || '?'} benefit claimants (${(rate * 100).toFixed(1)}%). Employment opportunities and apprenticeships resonate.`,
      })
    }
  }

  // LA-level earnings data
  const earnings = economyData.earnings
  if (earnings?.median_annual) {
    const englandMedian = 34963 // ONS ASHE 2024
    if (earnings.median_annual < englandMedian * 0.85) {
      points.push({
        category: 'Economy', icon: 'PoundSterling', priority: 2,
        text: `Local median earnings £${earnings.median_annual?.toLocaleString()}/yr — ${Math.round((1 - earnings.median_annual / englandMedian) * 100)}% below national average. Cost of living hits harder here.`,
      })
    }
  }

  // Census industry/occupation data (ward-level)
  const wards = economyData.wards || {}
  const ward = wards[wardName] || Object.values(wards).find(w => w?.name === wardName)
  if (ward?.industry) {
    // Find top industry
    const industries = Object.entries(ward.industry)
      .filter(([k]) => !k.includes('Total'))
      .sort((a, b) => b[1] - a[1])
    if (industries.length > 0) {
      const [topInd, topCount] = industries[0]
      const total = ward.industry['Total: All usual residents aged 16 years and over in employment'] || 1
      const pct = Math.round(topCount / total * 100)
      if (pct > 20) {
        const shortName = topInd.replace(/^[A-Z]\s+/, '').replace(/\s*\(.*\)/, '')
        points.push({
          category: 'Economy', icon: 'Factory', priority: 3,
          text: `${pct}% work in ${shortName}. Sector-specific concerns (automation, contracts, conditions) may resonate.`,
        })
      }
    }
  }

  return points.sort((a, b) => a.priority - b.priority)
}

// ---------------------------------------------------------------------------
// Health Talking Points (from health.json)
// ---------------------------------------------------------------------------

/**
 * Generate health-specific talking points from health.json ward data.
 */
export function generateHealthTalkingPoints(wardName, healthData) {
  const points = []
  if (!healthData) return points

  // LA-level indicators
  const indicators = healthData.indicators || {}

  // Life expectancy
  const leMale = indicators['Life expectancy at birth']?.male?.value
  const leFemale = indicators['Life expectancy at birth']?.female?.value
  if (leMale && leMale < 77) {
    points.push({
      category: 'Health', icon: 'Heart', priority: 1,
      text: `Male life expectancy ${leMale.toFixed(1)} years — below England average (79.3). Healthcare access, prevention, and healthy living are critical.`,
    })
  }

  // Under-75 mortality
  const u75Mortality = indicators['Under 75 mortality rate from all causes']?.persons?.value
  if (u75Mortality && u75Mortality > 400) {
    points.push({
      category: 'Health', icon: 'Activity', priority: 1,
      text: `Premature death rate ${Math.round(u75Mortality)} per 100K (England avg ~340). NHS investment, mental health, substance misuse services needed.`,
    })
  }

  // Ward-level health data (Census)
  const wards = healthData.wards || {}
  const ward = wards[wardName] || Object.values(wards).find(w => w?.name === wardName)
  if (ward?.general_health) {
    const total = ward.general_health['Total: All usual residents'] || 1
    const badHealth = (ward.general_health['Bad health'] || 0) + (ward.general_health['Very bad health'] || 0)
    const badPct = badHealth / total
    if (badPct > 0.08) {
      points.push({
        category: 'Health', icon: 'Heart', priority: 1,
        text: `${Math.round(badPct * 100)}% report bad/very bad health. GP access, hospital waiting times, and social care are doorstep priorities.`,
      })
    }
  }

  // Disability
  if (ward?.disability) {
    const total = ward.disability['Total: All usual residents'] || 1
    const limitedALot = ward.disability['Disabled under the Equality Act: Day-to-day activities limited a lot'] || 0
    if (limitedALot / total > 0.10) {
      points.push({
        category: 'Health', icon: 'Accessibility', priority: 2,
        text: `${Math.round(limitedALot / total * 100)}% severely disabled. Accessible services, blue badge, Motability, and care support matter.`,
      })
    }
  }

  return points.sort((a, b) => a.priority - b.priority)
}

// ---------------------------------------------------------------------------
// Crime Talking Points (uses demographics crime_stats or standalone)
// ---------------------------------------------------------------------------

/**
 * Generate crime-specific talking points from available crime data.
 */
export function generateCrimeTalkingPoints(wardName, demographicsData, deprivation) {
  const points = []

  // Use deprivation crime domain if available
  if (deprivation?.crime_decile != null && deprivation.crime_decile <= 2) {
    points.push({
      category: 'Crime', icon: 'Shield', priority: 1,
      text: `Top 20% worst for crime (crime domain decile ${deprivation.crime_decile}). Anti-social behaviour, visible policing, and community safety are vote-winners.`,
    })
  } else if (deprivation?.crime_decile != null && deprivation.crime_decile <= 4) {
    points.push({
      category: 'Crime', icon: 'Shield', priority: 2,
      text: `Above-average crime levels (crime domain decile ${deprivation.crime_decile}). Drug dealing, burglary, and night-time safety concerns likely.`,
    })
  }

  return points.sort((a, b) => a.priority - b.priority)
}

// ---------------------------------------------------------------------------
// Incumbent Entrenchment Analysis
// ---------------------------------------------------------------------------

/**
 * Calculate incumbent entrenchment score (0-100).
 * Higher = more entrenched, harder to unseat.
 *
 * Theory: Long-serving councillors build patronage networks, local name
 * recognition, and institutional advantages. The longer they serve, the
 * harder they are to defeat through conventional campaigning.
 *
 * Counter-strategy: hyper-local community organising, bypass party machines,
 * direct constituent engagement, expose complacency.
 */
export function scoreIncumbentEntrenchment(wardElection, wardCouncillors, integrityData) {
  let entrenchment = 0
  const factors = []

  if (!wardElection?.history?.length) return { score: 0, factors: [], level: 'unknown' }

  // Factor 1: Same-party tenure (max 30 points)
  // How many consecutive elections has the same party won?
  const history = wardElection.history || []
  let partyStreak = 0
  const currentParty = history[0]?.winner_party
  for (const h of history) {
    if (h.winner_party === currentParty) partyStreak++
    else break
  }
  const tenurePoints = Math.min(30, partyStreak * 6) // 5 consecutive = max 30
  entrenchment += tenurePoints
  if (partyStreak >= 3) {
    factors.push({ factor: 'Party tenure', value: tenurePoints, detail: `${partyStreak} consecutive wins for ${currentParty}` })
  }

  // Factor 2: Individual councillor tenure (max 20 points)
  const incumbentName = history[0]?.winner
  const sameName = history.filter(h => h.winner === incumbentName).length
  const personalPoints = Math.min(20, sameName * 5) // 4 personal wins = max 20
  entrenchment += personalPoints
  if (sameName >= 2) {
    factors.push({ factor: 'Personal incumbency', value: personalPoints, detail: `${incumbentName} won ${sameName} times` })
  }

  // Factor 3: Margin of victory (max 15 points)
  const lastMargin = history[0]?.margin || 0
  const marginPoints = Math.min(15, Math.round(lastMargin * 30)) // 50% margin = max 15
  entrenchment += marginPoints
  if (marginPoints > 5) {
    factors.push({ factor: 'Victory margin', value: marginPoints, detail: `Last won by ${Math.round(lastMargin * 100)}pp` })
  }

  // Factor 4: Executive/cabinet roles (max 15 points)
  const incumbent = wardCouncillors?.find(c => c.name === incumbentName)
  const hasRoles = incumbent?.roles?.length > 0
  const rolePoints = hasRoles ? 15 : 0
  entrenchment += rolePoints
  if (hasRoles) {
    factors.push({ factor: 'Executive roles', value: 15, detail: `Holds: ${incumbent.roles.slice(0, 2).join(', ')}` })
  }

  // Factor 5: Low opposition presence (max 10 points)
  // If our party has never stood or always gets <15%, area is unfamiliar territory
  const ourResults = history.filter(h => h.results?.some(r => /reform/i.test(r.party || '')))
  const noPresencePoints = ourResults.length === 0 ? 10 : ourResults.length < history.length / 2 ? 5 : 0
  entrenchment += noPresencePoints
  if (noPresencePoints > 0) {
    factors.push({ factor: 'Reform presence', value: noPresencePoints, detail: ourResults.length === 0 ? 'Never stood' : `Stood in ${ourResults.length}/${history.length} elections` })
  }

  // Factor 6: High turnout (max 10 points) — entrenched wards often have loyal high-turnout base
  const turnout = history[0]?.turnout || 0
  const turnoutPoints = turnout > 0.45 ? 10 : turnout > 0.35 ? 5 : 0
  entrenchment += turnoutPoints
  if (turnoutPoints > 0) {
    factors.push({ factor: 'Loyal turnout base', value: turnoutPoints, detail: `${Math.round(turnout * 100)}% turnout` })
  }

  const level = entrenchment >= 60 ? 'deeply_entrenched' :
                entrenchment >= 40 ? 'entrenched' :
                entrenchment >= 20 ? 'moderate' : 'weak'

  return { score: Math.min(100, entrenchment), factors, level }
}

// ---------------------------------------------------------------------------
// Ward-Level Strategic Playbook (Bannon-inspired populist framework)
// ---------------------------------------------------------------------------

/**
 * Generate a differentiated ward-level strategy combining:
 * - Demographic archetype (left-behind / affluent / diverse / retirement)
 * - Incumbent entrenchment level (how hard to unseat)
 * - Socioeconomic conditions (housing, economy, health, crime)
 * - Populist strategy principles (flood the zone, institutional distrust)
 *
 * Returns a structured playbook: headline strategy, messaging pillars,
 * attack vectors, GOTV approach, and canvassing script guidance.
 */
function generateWardStrategy(wardName, allData, ourParty = 'Reform UK') {
  const { demographicsData, deprivationData, housingData, economyData, healthData,
    electionsData, councillorsData, integrityData, votingData, politicalHistoryData } = allData

  // Lookup ward data
  const demoByName = {}
  if (demographicsData?.wards) {
    for (const [, val] of Object.entries(demographicsData.wards)) {
      if (val?.name) demoByName[val.name] = val
    }
  }
  const demo = demoByName[wardName] || null
  const deprivation = deprivationData?.wards?.[wardName] || null
  const wardElection = electionsData?.wards?.[wardName] || null
  const archetype = classifyWardArchetype(demo, deprivation)

  // Housing profile
  const wardHousing = housingData?.wards?.[wardName] || Object.values(housingData?.wards || {}).find(w => w?.name === wardName)
  const tenure = wardHousing?.tenure || {}
  const totalHH = tenure['Total: All households'] || tenure['Total'] || 1
  const socialPct = ((tenure['Social rented: Rents from council (Local Authority)'] || 0) +
    (tenure['Social rented: Other social rented'] || 0)) / totalHH
  const privatePct = (tenure['Private rented: Private landlord or letting agency'] || 0) / totalHH
  const ownedPct = ((tenure['Owned: Owns outright'] || 0) + (tenure['Owned: Owns with a mortgage or loan'] || 0)) / totalHH

  // Economy profile
  const wardClaimant = economyData?.ward_claimants?.find(w => w.ward_name === wardName || w.name === wardName)
  const claimantRate = wardClaimant?.claimant_rate || 0

  // Health profile
  const wardHealth = healthData?.wards?.[wardName] || Object.values(healthData?.wards || {}).find(w => w?.name === wardName)
  const badHealthPct = (() => {
    if (!wardHealth?.general_health) return 0
    const total = wardHealth.general_health['Total: All usual residents'] || 1
    return ((wardHealth.general_health['Bad health'] || 0) + (wardHealth.general_health['Very bad health'] || 0)) / total
  })()

  // Entrenchment
  const allCouncillors = councillorsData || []
  const cList = Array.isArray(allCouncillors) ? allCouncillors : allCouncillors.councillors || []
  const wardCouncillors = cList.filter(c => c.ward === wardName)
  const entrenchment = scoreIncumbentEntrenchment(wardElection, wardCouncillors, integrityData)

  // Political history (party switchers, long-serving)
  const historyPeople = politicalHistoryData?.people || []
  const wardPeople = historyPeople.filter(p =>
    (p.wards || []).some(w => w === wardName) ||
    (p.current_ward === wardName)
  )
  const partySwitchers = wardPeople.filter(p => p.party_changes?.length > 0)

  // Voting record of incumbent
  const defenderName = wardElection?.history?.[0]?.winner
  const defenderVotes = votingData?.votes?.filter(v =>
    v.votes_by_councillor?.some(vc => vc.name === defenderName || vc.name?.includes(defenderName?.split(' ').pop() || ''))
  ) || []

  // --- Determine strategy type ---
  const isMostDeprived = (deprivation?.avg_imd_decile || 5) <= 3
  const isHighSocialHousing = socialPct > 0.20
  const isHighClaimant = claimantRate > 0.04
  const isHighCrime = (deprivation?.crime_decile || 5) <= 3
  const isPoorHealth = badHealthPct > 0.06
  const isAffluent = (deprivation?.avg_imd_decile || 5) >= 7
  const isHighOwnership = ownedPct > 0.70
  const isDeeplyEntrenched = entrenchment.level === 'deeply_entrenched'
  const isEntrenched = entrenchment.level === 'entrenched' || isDeeplyEntrenched
  const isWorkingClassPopulist = (isMostDeprived || isHighClaimant) && !isAffluent

  // --- Build strategy ---
  const strategy = {
    archetype: archetype.archetype,
    headline: '',
    approach: '',
    messagingPillars: [],
    attackVectors: [],
    gotvApproach: '',
    canvassingGuidance: [],
    entrenchment,
    warnings: [],
  }

  // --- HEADLINE STRATEGY by archetype + conditions ---
  if (archetype.archetype === 'deprived_white' || (isWorkingClassPopulist && archetype.archetype !== 'deprived_diverse')) {
    strategy.headline = 'Populist Insurgency — The Forgotten Ward'
    strategy.approach = 'This ward has been taken for granted. The establishment parties promised change and delivered decline. ' +
      'Run as the insurgent — the only party willing to say what locals already know. ' +
      'Flood the zone: council waste, immigration pressure, failing services. Every conversation is about institutional failure.'
    strategy.messagingPillars = [
      { pillar: 'Institutional Betrayal', detail: 'The council has failed this ward for decades. Same faces, same excuses, same decline.' },
      { pillar: 'Cost of Living', detail: `${isHighClaimant ? `${Math.round(claimantRate * 100)}% on benefits. ` : ''}Council tax rises while services cut. Who\'s getting rich?` },
      { pillar: 'Local Accountability', detail: 'Your councillor voted for [X] while this ward got nothing. Time for someone who actually lives the experience.' },
    ]
    if (isHighSocialHousing) {
      strategy.messagingPillars.push({ pillar: 'Housing Justice', detail: `${Math.round(socialPct * 100)}% social housing — repairs taking months, waiting lists growing, while council builds vanity projects.` })
    }
    if (isHighCrime) {
      strategy.messagingPillars.push({ pillar: 'Community Safety', detail: 'Drug dealing on street corners, anti-social behaviour ignored. The council cut community safety while spending on consultants.' })
    }
    if (isPoorHealth) {
      strategy.messagingPillars.push({ pillar: 'Health Inequality', detail: `${Math.round(badHealthPct * 100)}% in poor health. GP access collapsing, ambulance waits growing. This ward deserves better.` })
    }
    strategy.gotvApproach = 'Target non-voters and angry lapsed voters. These people haven\'t voted because no one spoke to them. ' +
      'Postal vote registration is critical. Knock every door twice minimum — once to listen, once to confirm. ' +
      'Election day: lifts to polling station, morning knock-up of confirmed supporters.'
    strategy.canvassingGuidance = [
      'Lead with: "Can I ask you honestly — do you think this area is getting better or worse?"',
      'Listen first, validate frustration. Never defend the status quo.',
      'Use specific local examples: "The council spent £X on [waste] while your [street/service] was cut."',
      'Close with: "We\'re the only party that will actually say what you\'re telling me on the doorstep."',
    ]
  } else if (archetype.archetype === 'deprived_diverse') {
    strategy.headline = 'Community Coalition — Earned Trust'
    strategy.approach = 'Diverse, deprived ward. Trust must be earned through community presence, not parachuted messaging. ' +
      'Focus on shared economic concerns that cross ethnic lines — housing, jobs, cost of living, public services. ' +
      'Avoid immigration as a lead topic. Partner with local community leaders, attend events, be visible.'
    strategy.messagingPillars = [
      { pillar: 'Community Investment', detail: 'This ward contributes to the borough but gets crumbs back. Where does the council tax go?' },
      { pillar: 'Jobs & Opportunity', detail: 'Local businesses struggling, high street declining. The council should support entrepreneurs, not consultants.' },
      { pillar: 'Housing Standards', detail: `${privatePct > 0.25 ? Math.round(privatePct * 100) + '% renting privately. ' : ''}Rogue landlords, overcrowding, and HMO proliferation affecting quality of life.` },
    ]
    strategy.gotvApproach = 'Engage through community hubs — mosques, temples, community centres, local shops. ' +
      'Multi-language literature where appropriate. Peer-to-peer endorsement more effective than cold canvassing.'
    strategy.canvassingGuidance = [
      'Lead with: "What\'s the single biggest issue facing your family right now?"',
      'Emphasise local service delivery, not national culture wars.',
      'Show knowledge of specific local businesses and community institutions.',
      'Avoid: immigration rhetoric, national identity framing. Focus: economic fairness, service delivery.',
    ]
  } else if (archetype.archetype === 'affluent_retired' || archetype.archetype === 'retirement') {
    strategy.headline = 'Stewardship & Value — Protect What Matters'
    strategy.approach = 'Older, comfortable ward. These voters want competence, not revolution. ' +
      'Pitch: the council is wasting your money on ideology while your local area is quietly declining. ' +
      'Planning applications threatening character. Council tax rising faster than services improve.'
    strategy.messagingPillars = [
      { pillar: 'Value for Money', detail: 'Band D up again. Where does it go? Not your roads, not your bins, not your parks.' },
      { pillar: 'Local Character', detail: 'Inappropriate development, green belt pressure, conservation area neglect. Protect what makes this area special.' },
      { pillar: 'Council Tax Accountability', detail: 'Your council tax statement vs. what you actually see. The gap is the story.' },
    ]
    if (isPoorHealth) {
      strategy.messagingPillars.push({ pillar: 'Health & Social Care', detail: 'NHS waiting lists, social care crisis. Your generation built this country — it should look after you.' })
    }
    strategy.gotvApproach = 'Traditional canvassing works well — these voters engage. ' +
      'Postal vote push (many already have). Targeted leaflets through letterboxes, local newspaper ads. ' +
      'Personal touch: handwritten notes, local surgery invitations.'
    strategy.canvassingGuidance = [
      'Lead with: "How do you feel the council is spending your council tax?"',
      'Be respectful, knowledgeable about local planning issues.',
      'Reference specific council spending figures — these voters appreciate facts.',
      'Avoid: inflammatory language, anti-establishment rhetoric. Use: accountability, value, stewardship.',
    ]
  } else if (archetype.archetype === 'affluent_family') {
    strategy.headline = 'Aspiration & Accountability — Working Hard, Getting Less'
    strategy.approach = 'Working families paying high taxes and seeing diminishing returns. ' +
      'These voters are time-poor — messaging must be sharp and fact-based. ' +
      'Schools, roads, and planning are the trinity. Council waste enrages this demographic.'
    strategy.messagingPillars = [
      { pillar: 'Tax Burden', detail: 'Working families taxed to the hilt — council tax, national insurance, childcare costs. What do you get for it?' },
      { pillar: 'Schools & Childcare', detail: 'SEND waiting times, school place shortages, breakfast club cuts. Your children deserve better.' },
      { pillar: 'Roads & Infrastructure', detail: 'Potholes, traffic congestion, inadequate parking. The basics aren\'t being delivered.' },
    ]
    strategy.gotvApproach = 'Digital-first: targeted social media, email, local WhatsApp groups. ' +
      'These voters research online before deciding. Leaflet with QR code to website with detailed local data.'
    strategy.canvassingGuidance = [
      'Lead with: "Between council tax and everything else — do you feel you\'re getting value?"',
      'Be data-driven: specific figures, local examples, comparative data.',
      'These voters respond to competence and specificity, not anger.',
      'Avoid: emotional populism, inflammatory language. Use: evidence, efficiency, accountability.',
    ]
  } else {
    strategy.headline = 'Broad Appeal — Common Sense Local Politics'
    strategy.approach = 'Middle-ground ward. Standard broad messaging — bins, roads, council tax, planning. ' +
      'Identify the 2-3 most pressing local issues and hammer them relentlessly.'
    strategy.messagingPillars = [
      { pillar: 'Local Services', detail: 'Bins, roads, streetlights, parks — the basics the council should deliver but doesn\'t.' },
      { pillar: 'Value for Money', detail: 'Council tax rises year after year. Services get cut. Someone isn\'t telling the truth.' },
      { pillar: 'Fresh Voice', detail: 'Time for a councillor who listens, acts, and reports back. Not a party machine placeholder.' },
    ]
    strategy.gotvApproach = 'Balanced approach: leaflets + social media + door-knocking. ' +
      'Focus on identified supporters and persuadables from canvass returns.'
    strategy.canvassingGuidance = [
      'Lead with: "What one thing would you change about this area?"',
      'Note specific issues for follow-up leaflet/letter.',
      'Adaptable — match your pitch to the voter\'s concern.',
    ]
  }

  // --- ATTACK VECTORS (Bannon principle: flood the zone) ---
  // Generate multiple simultaneous attack lines to overwhelm incumbent defences

  if (isEntrenched) {
    strategy.attackVectors.push({
      vector: 'Complacency',
      detail: `${entrenchment.score >= 60 ? 'Deeply entrenched' : 'Entrenched'} incumbent (score: ${entrenchment.score}/100). Attack: "They take your vote for granted. When did they last knock your door?"`,
    })
  }

  // Voting record attacks
  if (defenderVotes.length > 0) {
    const againstVotes = defenderVotes.filter(v =>
      v.votes_by_councillor?.find(vc => vc.name === defenderName)?.vote === 'against'
    )
    if (againstVotes.length > 0) {
      strategy.attackVectors.push({
        vector: 'Voting Record',
        detail: `Your councillor voted against ${againstVotes.length} measure${againstVotes.length > 1 ? 's' : ''} including: ${againstVotes.slice(0, 2).map(v => v.title).join(', ')}`,
      })
    }
    const budgetVotes = defenderVotes.filter(v => v.type === 'budget')
    if (budgetVotes.length > 0) {
      const forBudget = budgetVotes.some(v =>
        v.votes_by_councillor?.find(vc => vc.name === defenderName)?.vote === 'for'
      )
      if (forBudget) {
        strategy.attackVectors.push({
          vector: 'Budget Vote',
          detail: 'Your councillor voted FOR the council tax rise. They chose to take more of your money.',
        })
      }
    }
  }

  // Party switchers in the ward
  if (partySwitchers.length > 0) {
    strategy.attackVectors.push({
      vector: 'Party Loyalty',
      detail: `${partySwitchers.length} politician${partySwitchers.length > 1 ? 's' : ''} in this ward changed party. Loyalty to party, not to you.`,
    })
  }

  // Council performance attacks
  if (isHighSocialHousing && isEntrenched) {
    strategy.attackVectors.push({
      vector: 'Housing Neglect',
      detail: 'Social housing dominant — but repairs take months, waiting lists grow, and the council builds elsewhere. This ward is an afterthought.',
    })
  }

  if (isHighCrime) {
    strategy.attackVectors.push({
      vector: 'Community Safety Failure',
      detail: 'One of the highest crime wards in the borough. What has your councillor done about it? Nothing. They don\'t live here.',
    })
  }

  // --- WARNINGS ---
  if (isDeeplyEntrenched && !isWorkingClassPopulist) {
    strategy.warnings.push('Deeply entrenched incumbent with strong local base. This requires sustained long-term effort — don\'t expect quick wins.')
  }
  if (archetype.archetype === 'deprived_diverse') {
    strategy.warnings.push('Diverse ward — cultural sensitivity required. Immigration-focused messaging will backfire. Lead with economic issues.')
  }
  if (entrenchment.score >= 70) {
    strategy.warnings.push('Entrenchment score >70: Consider whether resources are better deployed elsewhere unless strategic reasons (neighbouring seat, profile) justify.')
  }

  return strategy
}

/**
 * Generate auto-talking-points for a ward based on demographics, deprivation, turnout, and spending.
 * @param {Object} wardElection - Ward data from elections.json
 * @param {Object|null} demographics - Census 2021 ward data
 * @param {Object|null} deprivation - IMD 2019 ward data
 * @param {Object|null} wardPrediction - Output from predictWard()
 * @returns {Array<{ category: string, icon: string, priority: number, text: string }>}
 */
function generateTalkingPoints(wardElection, demographics, deprivation, wardPrediction) {
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
        text: `${redFlags.length} integrity red flag${redFlags.length > 1 ? 's' : ''} identified: ${redFlags.slice(0, 2).map(f => f.description || f.detail || f.flag || f.type || (typeof f === 'string' ? f : 'undisclosed')).join('; ')}`,
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
function generateNationalLines(constituencyData, demographics, deprivation, ourParty = 'Reform UK') {
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
function buildWardProfile(demographics, deprivation, wardElection, constituencyName) {
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
function scoreWardPriority({
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
function generateCheatSheet(dossier) {
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
    propertyAssets, planningData,
    hmoData, fiscalData, pollingData,
    housingData, economyData, healthData,
    votingData, politicalHistoryData,
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

  // Talking points — categorised (all ward-level data sources)
  const localPoints = generateTalkingPoints(wardElection, demo, deprivation, pred);
  const assetPoints = generateAssetTalkingPoints(wardName, propertyAssets);
  const planningPoints = generatePlanningTalkingPoints(wardName, planningData);
  const hmoPoints = generateHMOTalkingPoints(wardName, hmoData);
  const fiscalPoints = generateFiscalTalkingPoints(fiscalData, deprivation);
  const meetingsPoints = generateMeetingsTalkingPoints(wardName, meetingsData, wardCouncillors);
  const pollingPoints = generatePollingTalkingPoints(pollingData, ourParty);
  const housingPoints = generateHousingTalkingPoints(wardName, housingData);
  const economyPoints = generateEconomyTalkingPoints(wardName, economyData);
  const healthPoints = generateHealthTalkingPoints(wardName, healthData);
  const crimePoints = generateCrimeTalkingPoints(wardName, demographicsData, deprivation);
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
    local: [...localPoints, ...assetPoints, ...planningPoints, ...hmoPoints, ...meetingsPoints,
            ...housingPoints, ...economyPoints, ...healthPoints, ...crimePoints],
    council: [...councilAttack, ...fiscalPoints],
    national: [...pureNational, ...pollingPoints],
    constituency: constituencyPoints,
  };

  // Incumbent entrenchment scoring
  let entrenchment = { score: 0, factors: [], level: 'unknown' };
  let wardStrategy = { headline: 'Insufficient data', archetype: 'broad_appeal', approach: '', messagingPillars: [], attackVectors: [], gotvApproach: '', canvassingGuidance: [], warnings: [] };
  try {
    entrenchment = scoreIncumbentEntrenchment(wardElection, wardCouncillors, integrityData);
  } catch (e) {
    console.error('[DOSSIER] entrenchment error:', e);
  }

  // Full ward strategy playbook (Bannon-style differentiated messaging)
  try {
    wardStrategy = generateWardStrategy(wardName, {
      ...allData,
      wardElection, demo, deprivation, wardCouncillors, constituency,
      entrenchment, swingRequired: swingReq, winProbability: winProb,
      politicalHistoryData, votingData,
    }, ourParty);
  } catch (e) {
    console.error('[DOSSIER] wardStrategy error:', e);
  }

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

  // Fiscal context — cross-engine bridge to savingsEngine financial health assessment
  let fiscalContext = null;
  if (budgetSummary) {
    try {
      const health = financialHealthAssessment(budgetSummary, null);
      if (health) {
        fiscalContext = {
          reserves_rating: health.summary?.reserves_rating || 'Unknown',
          reserves_months: health.summary?.reserves_months || 0,
          collection_efficiency: councilPerformance.collectionRate?.latest || null,
          overall_health: health.summary?.overall_resilience || 'Unknown',
          overall_color: health.summary?.overall_color || '#6c757d',
        };

        // Critical reserves warning — add high-priority fiscal talking point
        if (health.summary?.reserves_months > 0 && health.summary.reserves_months < 3) {
          talkingPoints.council.unshift({
            category: 'Fiscal',
            icon: 'AlertTriangle',
            priority: 0,
            text: `CRITICAL: Council reserves cover only ${health.summary.reserves_months.toFixed(1)} months of spending. Risk of section 114 notice. Demand answers on financial sustainability.`,
          });
        }
      }
    } catch (e) {
      console.error('[DOSSIER] fiscalContext error:', e);
    }
  }

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
    entrenchment,
    wardStrategy,
    fiscalContext,
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

// ---------------------------------------------------------------------------
// Canvassing Playbook — world-class doorstep scripts per ward
// ---------------------------------------------------------------------------

/** Body language tips — universal, not ward-specific */
const BODY_LANGUAGE_TIPS = [
  'Stand slightly back from the door — never lean in. Let them come to you.',
  'Smile naturally. Make eye contact when they speak, look away occasionally when you speak.',
  'Hold your clipboard/phone at waist level, never raised like a barrier.',
  'Mirror their body language subtly — if they fold arms, slow down and soften tone.',
  'If they step outside, take a small step back. Give them space.',
  'If a dog barks, wait. Never talk over a barking dog.',
  'If they\'re busy: "I can see you\'re busy — can I leave this leaflet? We\'re standing in this ward for the first time."',
  'If children answer: "Is mum or dad in?" Never engage with children alone.',
]

/** Issue-specific doorstep responses — archetype-sensitive */
const DOORSTEP_ISSUES = {
  council_tax: {
    question: 'Council tax — is it good value?',
    responses: {
      deprived_white: 'Your council tax goes up every year but what do you actually see for it? We want to audit every penny and cut the waste.',
      deprived_diverse: 'Council tax hits hardest on people who can least afford it. We want to make sure every pound goes to frontline services, not back-office bureaucracy.',
      affluent_retired: 'You\'ve paid council tax your whole life. You deserve to know exactly where it goes. We\'ll publish full transparency dashboards so you can see every spend.',
      affluent_family: 'Between mortgage, bills, and council tax, families are stretched. We want to drive efficiency so your money goes further — better schools, better roads, less waste.',
      middle_ground: 'Council tax keeps going up but services don\'t improve. We\'ll challenge every budget line and make sure your money works harder.',
      default: 'We believe council tax should deliver visible results. We\'ll fight for transparency and value for money.',
    },
  },
  roads_potholes: {
    question: 'Roads and potholes',
    responses: {
      default: 'Lancashire\'s roads are a disgrace — we all know it. The council has the budget but won\'t prioritise properly. We\'ll push for a road-by-road repair plan with public tracking.',
    },
  },
  nhs_health: {
    question: 'NHS and health services',
    responses: {
      retirement: 'GP access is getting worse, not better. At county level we control adult social care — we\'ll make sure it works properly so hospitals aren\'t blocked by people who should be home with the right support.',
      default: 'Health starts locally. We\'ll push for better social care, proper mental health support, and making sure council-funded services actually reach the people who need them.',
    },
  },
  immigration: {
    question: 'Immigration and asylum',
    responses: {
      deprived_white: 'I hear this a lot on doorsteps. The asylum system is broken and it\'s local areas like this that carry the cost. We\'ll push for full transparency on dispersal numbers and costs.',
      deprived_diverse: 'Community cohesion matters. We want proper investment in local services that brings everyone together, not policies that set communities against each other.',
      affluent_retired: 'It\'s a national issue but it has local impact. We want honest numbers, proper planning, and fair distribution — not dumping on areas without consultation.',
      default: 'We want an honest conversation about immigration. Local councils should have a say, and communities deserve transparency about what\'s happening in their area.',
    },
  },
  housing: {
    question: 'Housing and planning',
    responses: {
      deprived_white: 'Social housing waiting lists are too long. We\'ll fight to prioritise local people who\'ve been waiting years, not newcomers who jump the queue.',
      deprived_diverse: 'Good housing is the foundation of a good life. We\'ll push for more affordable homes, tougher enforcement on rogue landlords, and better maintenance of council properties.',
      affluent_family: 'We understand the concern about overdevelopment. We\'ll fight to protect green spaces while making sure any new housing comes with the infrastructure — schools, roads, GP surgeries.',
      default: 'Everyone deserves a decent home. We\'ll push for sensible housing policy that respects local communities and protects green spaces.',
    },
  },
  cost_of_living: {
    question: 'Cost of living',
    responses: {
      deprived_white: 'Energy bills, food, council tax — everything\'s going up but wages aren\'t. At council level we can cut waste and make services cheaper. That\'s real help, not empty promises.',
      deprived_diverse: 'We know how hard it is. We\'ll push for council support services, fair procurement that keeps money local, and cutting the bureaucratic waste that drives up costs.',
      middle_ground: 'Working people are being squeezed from every direction. We\'ll fight to keep council tax as low as possible while maintaining the services you rely on.',
      default: 'The cost of living crisis hits everyone. We\'ll drive council efficiency so your taxes go further.',
    },
  },
  crime_safety: {
    question: 'Crime and anti-social behaviour',
    responses: {
      deprived_white: 'This area has been neglected for too long. We\'ll push for proper community policing, CCTV where it\'s needed, and council enforcement teams that actually turn up.',
      default: 'Everyone deserves to feel safe in their own community. We\'ll push for proper enforcement, better street lighting, and holding the police to account.',
    },
  },
  bins_waste: {
    question: 'Bins and waste collection',
    responses: {
      default: 'It\'s basic but it matters. Your bins should be collected reliably. If there\'s fly-tipping, the council should clean it up fast. We\'ll hold them to account on the basics.',
    },
  },
}

/**
 * Generate a comprehensive canvassing playbook for a specific ward.
 *
 * Produces ward-specific doorstep scripts, objection handling, opening lines,
 * closing techniques, defender intelligence, and issue-by-issue responses —
 * all shaped by the ward's demographics, election history, and archetype.
 *
 * @param {string} wardName
 * @param {object} allData — same 22-source data bag as generateWardDossier
 * @param {string} ourParty
 * @returns {object|null} Full canvassing playbook
 */
export function generateCanvassingPlaybook(wardName, allData, ourParty = 'Reform UK') {
  const dossier = generateWardDossier(wardName, allData, ourParty)
  if (!dossier) return null

  const { wardStrategy, profile, election, councillors, entrenchment, cheatSheet, talkingPoints } = dossier
  const archetype = wardStrategy?.archetype || profile?.archetype?.id || 'mixed'
  const defender = election?.defender?.party || election?.prediction?.winner || 'Unknown'
  const defenderName = election?.defender?.name || councillors?.[0]?.name || 'the incumbent'

  // --- Opening lines ---
  const openingLines = _buildOpeningLines(archetype, wardName, defender, defenderName, profile, election)

  // --- Issue responses ---
  const issueResponses = _buildIssueResponses(archetype, talkingPoints, profile)

  // --- Objection handling ---
  const objectionHandling = _buildObjectionHandling(archetype, defender, defenderName, entrenchment, election, ourParty)

  // --- Closing techniques ---
  const closingTechniques = _buildClosingTechniques(archetype, election, ourParty)

  // --- Defender briefing ---
  const defenderBriefing = _buildDefenderBriefing(councillors, entrenchment, election, defender)

  // --- Ward intelligence ---
  const wardIntelligence = _buildWardIntelligence(profile, cheatSheet, election)

  // --- GOTV strategy ---
  const gotv = _buildGOTV(archetype, profile, election)

  // --- Dos and Don'ts ---
  const { dos, donts } = _buildDoorstepRules(archetype, profile, cheatSheet)

  // --- Ward-specific local issues from elections.json ---
  const electionsData = allData?.electionsData
  const reformCandidates = electionsData?.meta?.next_election?.reform_candidates || {}
  const wardReformData = reformCandidates[wardName] || {}
  const localIssues = wardReformData.local_issues || BURNLEY_WARD_INTEL[wardName]?.local_issues || []
  const wardTier = BURNLEY_WARD_INTEL[wardName]?.tier || null
  const wardOpportunity = BURNLEY_WARD_INTEL[wardName]?.opportunity || null

  return {
    wardName,
    archetype,
    archetypeLabel: wardStrategy?.archetype?.replace(/_/g, ' ') || profile?.archetype?.label || 'Mixed',
    openingLines,
    issueResponses,
    objectionHandling,
    closingTechniques,
    doorstepDos: dos,
    doorstepDonts: donts,
    defenderBriefing,
    wardIntelligence,
    gotv,
    bodyLanguageTips: BODY_LANGUAGE_TIPS,
    messagingPillars: wardStrategy?.messagingPillars || [],
    warnings: cheatSheet?.doNotSay || wardStrategy?.warnings || [],
    localIssues,
    wardTier,
    wardOpportunity,
  }
}

// --- Playbook helpers (internal) ---

function _buildOpeningLines(archetype, wardName, defender, defenderName, profile, election) {
  const lines = []
  const elecDate = election?.prediction?.date || 'May 7th'
  const swingNeeded = election?.prediction?.swing_needed
  const margin = election?.history?.[0]?.margin_pct

  // Universal opener
  lines.push({
    scenario: 'Standard introduction',
    script: `Hi there — I'm [YOUR NAME] and I'm standing for Reform UK in ${wardName} on ${elecDate}. We've never had a candidate here before, and I wanted to introduce myself and hear what matters to you.`,
    note: 'Warm, non-confrontational. Establishes novelty — you\'re the new option.',
  })

  // If incumbent is very entrenched
  if (margin && margin > 30) {
    lines.push({
      scenario: 'Long-standing incumbent ward',
      script: `Hi — I'm standing for Reform UK. I know ${defenderName} has been here a long time, but honestly, that's part of why I'm standing. When someone's had the job for decades, they stop asking what you need. I'm here to listen.`,
      note: 'Frames tenure as complacency, not experience.',
    })
  }

  // Archetype-specific
  if (['deprived_white', 'struggling'].includes(archetype)) {
    lines.push({
      scenario: 'Deprived/working-class area',
      script: `Can I ask you honestly — has this area got better or worse in the last few years? Because from what I can see walking round, it's getting left behind. And nobody's doing anything about it.`,
      note: 'Validates frustration. Let them talk — they will.',
    })
  } else if (archetype === 'deprived_diverse') {
    lines.push({
      scenario: 'Diverse community',
      script: `I'm [NAME] from Reform UK. I'm not here to lecture anyone — I want to know what YOUR priorities are for this community. What's the one thing you'd want your councillor to fix?`,
      note: 'Respectful, listening-first. Avoids culture-war framing.',
    })
  } else if (['affluent_retired', 'retirement'].includes(archetype)) {
    lines.push({
      scenario: 'Older/retired voter',
      script: `Good [morning/afternoon] — I'm standing for Reform UK on ${elecDate}. You've paid council tax for a long time. Do you feel you're getting value for it? Because I don't think many people do.`,
      note: 'Respectful but direct. Council tax value is the hook.',
    })
  } else if (archetype === 'affluent_family') {
    lines.push({
      scenario: 'Family/professional area',
      script: `Hi — quick question. If you could change one thing about how this council runs, what would it be? I'm standing for Reform UK because I think we can do things properly.`,
      note: 'Professional tone. Competence over anger.',
    })
  } else {
    lines.push({
      scenario: 'General/mixed ward',
      script: `What one thing would you change about this area if you could? I'm standing because I think people deserve better from their local council.`,
      note: 'Open-ended. Let them set the agenda.',
    })
  }

  // Return-visit opener
  lines.push({
    scenario: 'Second visit / follow-up',
    script: `Hi again — I called a few weeks ago. You mentioned [ISSUE]. I wanted to let you know what I've found out about that...`,
    note: 'Shows you listened and followed through. Incredibly powerful.',
  })

  // Busy/interrupted
  lines.push({
    scenario: 'They\'re clearly busy',
    script: `I can see you\'re in the middle of something — I won't keep you. Can I leave this leaflet? It's got my number on it. I'm the Reform UK candidate on ${elecDate}.`,
    note: 'Respect their time. The leaflet does the work.',
  })

  return lines
}

function _buildIssueResponses(archetype, talkingPoints, profile) {
  const responses = []

  for (const [issueKey, issue] of Object.entries(DOORSTEP_ISSUES)) {
    const response = issue.responses[archetype] || issue.responses.default
    // Find ward-specific talking point evidence for this issue
    const allTPs = [...(talkingPoints?.local || []), ...(talkingPoints?.council || []), ...(talkingPoints?.national || [])]
    const wardEvidence = allTPs.filter(tp => {
      const text = (tp.text || '').toLowerCase()
      return issueKey === 'council_tax' ? text.includes('council tax') || text.includes('band d') :
             issueKey === 'roads_potholes' ? text.includes('road') || text.includes('pothole') || text.includes('highway') :
             issueKey === 'nhs_health' ? text.includes('health') || text.includes('gp') || text.includes('nhs') || text.includes('social care') :
             issueKey === 'immigration' ? text.includes('immigration') || text.includes('asylum') || text.includes('dispersal') :
             issueKey === 'housing' ? text.includes('housing') || text.includes('rent') || text.includes('tenant') || text.includes('social hous') :
             issueKey === 'cost_of_living' ? text.includes('cost of living') || text.includes('energy') || text.includes('food bank') :
             issueKey === 'crime_safety' ? text.includes('crime') || text.includes('anti-social') || text.includes('asb') :
             issueKey === 'bins_waste' ? text.includes('bin') || text.includes('waste') || text.includes('recycling') || text.includes('fly-tip') :
             false
    }).slice(0, 2)

    responses.push({
      issue: issue.question,
      response,
      wardEvidence: wardEvidence.map(tp => tp.text),
    })
  }

  return responses
}

function _buildObjectionHandling(archetype, defender, defenderName, entrenchment, election, ourParty) {
  const objections = []
  const tenure = entrenchment?.factors?.find(f => f?.factor === 'Individual tenure')
  const tenureYears = tenure?.value || ''

  // 1. "I always vote [defender party]"
  objections.push({
    objection: `"I always vote ${defender}"`,
    response: `I respect that. But can I ask — when was the last time they knocked on your door and asked what you need? We're here because we think you deserve more than a party that takes your vote for granted.`,
    tone: 'Respectful but pointed. Don\'t attack the voter — attack the party\'s complacency.',
  })

  // 2. "I've never heard of Reform locally"
  objections.push({
    objection: '"I\'ve never heard of Reform in this area"',
    response: `That's exactly why I'm here. We're building from the ground up — no career politicians, no party machine. Just local people who've had enough of the same old parties delivering the same old results.`,
    tone: 'Turn the weakness into a strength. Novelty = authenticity.',
  })

  // 3. "You can't change anything as a councillor"
  objections.push({
    objection: '"Councillors can\'t change anything"',
    response: `Actually, councillors vote on your council tax, planning applications, road repairs, social housing — everything that affects your daily life. The problem isn't that councillors can't change things, it's that the ones we've got won't.`,
    tone: 'Educate without condescending. Be specific.',
  })

  // 4. "I don't vote"
  objections.push({
    objection: '"I don\'t bother voting"',
    response: `I get it — I used to think the same. But that's how they get away with wasting your money. Your council tax went up but did your services improve? If enough people like you vote, we can actually change things.`,
    tone: 'Empathise first, then make it personal. "People like you" = empowerment.',
  })

  // 5. Long-serving incumbent
  if (tenureYears || (entrenchment?.score || 0) > 60) {
    objections.push({
      objection: `"${defenderName} does a good job"`,
      response: `They've been doing this a long time${tenureYears ? ` — ${tenureYears}` : ''}. But I'd ask: has the area got better? If you've had the same representative for years and things aren't improving, maybe it's time to try someone new.`,
      tone: 'Don\'t attack the person — question the results. "Time for something new" is powerful.',
    })
  }

  // 6. "Reform are just about immigration"
  objections.push({
    objection: '"Reform are just about immigration"',
    response: `That's what people assume, but look at what I'm actually talking about — council tax, roads, local services, accountability. At local level it's about making sure your money is spent properly. That's what I'll focus on.`,
    tone: 'Pivot to local. Never get defensive about the national party.',
  })

  // 7. Archetype-specific
  if (archetype === 'deprived_diverse') {
    objections.push({
      objection: '"Reform doesn\'t represent my community"',
      response: `I'm here to represent everyone in this ward, full stop. I want better services, safer streets, and proper investment for this community. If that's what you want too, we're on the same side.`,
      tone: 'Universal values. Never engage with identity framing — stay on services.',
    })
  }

  // 8. "I'm voting tactically"
  if (election?.prediction?.classification?.id === 'battleground' || election?.prediction?.classification?.id === 'target') {
    objections.push({
      objection: '"I\'m voting tactically to keep [party] out"',
      response: `I understand the instinct. But tactical voting just keeps the same parties in power. If you vote for what you actually believe in, you might be surprised how many of your neighbours feel the same way.`,
      tone: 'Positive. Frame as liberation from the tactical trap.',
    })
  }

  return objections
}

function _buildClosingTechniques(archetype, election, ourParty) {
  const elecDate = election?.prediction?.date || 'May 7th'
  const techniques = []

  techniques.push({
    technique: 'The direct ask',
    script: `So — can I count on your vote on ${elecDate}? It\'s the first time ${ourParty} has stood here, and every single vote matters.`,
  })

  techniques.push({
    technique: 'The soft commitment',
    script: `I won't ask you to promise anything — but will you at least consider us? And if you do have any questions between now and ${elecDate}, my number\'s on the leaflet.`,
  })

  techniques.push({
    technique: 'The follow-up close',
    script: `I'm going to come back before election day. Is there anything specific you'd like me to find out about? I'll look into it and let you know.`,
  })

  if (['deprived_white', 'struggling', 'middle_ground'].includes(archetype)) {
    techniques.push({
      technique: 'The protest vote close',
      script: `If you\'re fed up with the same old parties, this is your chance to send a message. We don\'t need to win this time — but a strong vote for Reform tells them this area won\'t be ignored any more.`,
    })
  }

  return techniques
}

function _buildDefenderBriefing(councillors, entrenchment, election, defender) {
  const defCouncillors = councillors?.filter(c => c.party === defender) || []
  const primary = defCouncillors[0] || {}
  const history = election?.history || []
  const recent = history.slice(0, 5)
  const margins = recent.map(h => h.margin_pct).filter(m => m != null)
  const trend = margins.length >= 2 ? (margins[0] < margins[margins.length - 1] ? 'weakening' : 'strengthening') : 'unknown'

  const vulnerabilities = []
  if (entrenchment?.score > 70) vulnerabilities.push('Deeply entrenched — complacency is the angle')
  if (trend === 'weakening') vulnerabilities.push(`Vote share declining — margins: ${margins.map(m => m.toFixed(1) + '%').join(' → ')}`)
  if (primary.integrityIssues?.length) vulnerabilities.push(`${primary.integrityIssues.length} integrity flags`)
  if (primary.attackLines?.length) vulnerabilities.push(...primary.attackLines.slice(0, 2).map(a => typeof a === 'string' ? a : a.line || a.attack || String(a)))
  const strengths = []
  if (entrenchment?.score < 40) strengths.push('Relatively new — less personal vote to overcome')
  if (trend === 'strengthening') strengths.push('Growing vote share — don\'t underestimate')
  if (primary.name) strengths.push(`Known locally as ${primary.name}`)

  return {
    name: primary.name || 'Unknown',
    party: defender,
    tenure: entrenchment?.factors?.find(f => f?.factor === 'Individual tenure')?.detail || 'Unknown',
    marginTrend: trend,
    recentMargins: margins,
    vulnerabilities,
    strengths,
    doNotMention: primary.integrityIssues?.length ? [] : ['No known integrity issues — don\'t invent them'],
  }
}

function _buildWardIntelligence(profile, cheatSheet, election) {
  return {
    keyStats: cheatSheet?.keyStats || [],
    population: profile?.population,
    electorate: profile?.electorate,
    turnoutHistory: election?.history?.slice(0, 5).map(h => ({
      year: h.year, turnout: h.turnout_pct, winner: h.winner, party: h.winning_party, margin: h.margin_pct,
    })) || [],
    deprivationNote: profile?.deprivation ? `IMD decile ${profile.deprivation.avg_imd_decile} — ${profile.deprivation.level || ''}` : null,
    demographicNote: profile?.demographics
      ? `${profile.demographics.white_british_pct ? Math.round(profile.demographics.white_british_pct) + '% White British' : ''}, ${profile.demographics.over_65_pct ? Math.round(profile.demographics.over_65_pct) + '% over 65' : ''}`
      : null,
  }
}

function _buildGOTV(archetype, profile, election) {
  const elecDate = election?.prediction?.date || 'May 7th'
  const turnout = election?.history?.[0]?.turnout_pct

  const approach = ['deprived_white', 'deprived_diverse', 'struggling'].includes(archetype)
    ? `Low-turnout ward${turnout ? ` (${turnout.toFixed(0)}% last time)` : ''}. Every vote is magnified. Focus on getting YOUR voters out, not converting opponents. Door-knock identified supporters on election day morning and afternoon.`
    : ['affluent_retired', 'retirement'].includes(archetype)
      ? `Higher-turnout ward. Postal vote sign-ups are critical — many older voters prefer them. Ask about postal votes during canvassing. Follow up with identified supporters by phone the weekend before.`
      : `Target identified supporters with a reminder leaflet 3 days before ${elecDate}. Text/WhatsApp supporters on the morning. Have a visible presence at polling stations — rosette, smile, "Good morning".`

  const targetVoters = ['deprived_white', 'struggling'].includes(archetype)
    ? 'Previous non-voters who are angry but haven\'t had anyone to vote for. Also: former UKIP/BNP voters who\'ve stayed home since.'
    : archetype === 'deprived_diverse'
      ? 'Community leaders and their networks. One respected voice endorsing you can move dozens of votes.'
      : ['affluent_retired', 'retirement'].includes(archetype)
        ? 'Postal voters, regular voters frustrated with council tax rises, and anyone who mentioned value-for-money concerns.'
        : 'Anyone who expressed frustration with the status quo. First-time voters. People who said "I\'ll think about it" — they\'re persuadable.'

  return { approach, targetVoters, electionDate: elecDate }
}

function _buildDoorstepRules(archetype, profile, cheatSheet) {
  const dos = [
    'Listen more than you talk — aim for 70/30 in their favour',
    'Note their name and issue for follow-up (shows you care)',
    'Use local street names, landmarks, and businesses — shows you know the area',
    'Carry a pen — you\'ll need to write things down',
    'Dress smart-casual. Clean shoes. Reform rosette visible but not overbearing',
    'Say "I don\'t know, but I\'ll find out" when you genuinely don\'t know',
    'Thank them for their time even if they\'re hostile — you never know who\'s watching',
  ]

  const donts = [
    'Never argue on the doorstep — if they\'re hostile, thank them and move on',
    'Never promise what you can\'t deliver — "I\'ll fight for" is better than "I\'ll do"',
    'Never criticise voters for their previous choices — "I understand why" is always better',
    'Never spend more than 3-4 minutes per door — volume matters more than depth',
    'Never canvass alone after dark',
    'Never discuss your personal income, religion, or family situation',
  ]

  // Archetype-specific warnings
  if (cheatSheet?.doNotSay?.length) {
    for (const warning of cheatSheet.doNotSay) {
      donts.push(warning)
    }
  }

  if (['deprived_diverse'].includes(archetype)) {
    donts.push('Never use immigration as an attack line in this ward — focus on services and community')
    dos.push('Learn key community organisations and faith institutions — reference them when appropriate')
  }

  if (['affluent_retired', 'retirement'].includes(archetype)) {
    donts.push('Don\'t be rushed or aggressive — older voters respond to patience and courtesy')
    dos.push('Ask about postal votes — many prefer them')
  }

  if (['affluent_family'].includes(archetype)) {
    dos.push('Have data ready — school performance, planning stats, council spending figures')
  }

  return { dos, donts }
}

// ---------------------------------------------------------------------------
// Burnley Election Briefing (May 7 2026)
// ---------------------------------------------------------------------------

/**
 * Ward-level intelligence constant for Burnley borough election May 7 2026.
 * Sourced from elections.json, deprivation.json, economy.json, housing.json.
 */
export const BURNLEY_WARD_INTEL = {
  'Daneshouse with Stoneyholme': {
    tier: 'must_win', opportunity: 95, imd: 59.1, claimants_pct: 10.0,
    ukip_peak: 49.2, ukip_year: 2015, defender: 'Labour',
    local_issues: ['highest deprivation', 'unemployment 10%', 'HMO abuse (39.4% private rented)'],
    messaging: 'Reclaim the UKIP seat. Peter Gill won here twice. Services-first: jobs, housing standards, council failure.',
  },
  'Queensgate': {
    tier: 'must_win', opportunity: 85, imd: 44.2, claimants_pct: 7.3,
    ukip_peak: 40.3, ukip_year: 2015, defender: 'Labour',
    local_issues: ['high deprivation', 'unemployment 7.3%', 'HMO density (35.2% private rented)'],
    messaging: 'Karen Ingham got 40% for UKIP. Reclaim with jobs & housing standards focus.',
  },
  'Trinity': {
    tier: 'must_win', opportunity: 90, imd: 63.1, claimants_pct: 7.8,
    ukip_peak: 36.3, ukip_year: 2015, defender: 'Green Party',
    local_issues: ['most deprived ward in Burnley', 'HMO exploitation (39.1% private rented)', 'unemployment 7.8%'],
    messaging: 'Jeff Sumner already holds 1 seat. Push for 2nd. Tom Commis UKIP heritage. Most deprived = most neglected.',
  },
  'Bank Hall': {
    tier: 'competitive', opportunity: 70, imd: 62.3, claimants_pct: 8.7,
    ukip_peak: 24.4, ukip_year: 2015, defender: 'Independent',
    local_issues: ['highest unemployment in Burnley (8.7%)', 'very high deprivation', 'high private renting (40.3%)'],
    messaging: 'Independent councillors lack resources to deliver. Ultra-high unemployment demands national movement backing.',
  },
  'Coalclough with Deerplay': {
    tier: 'competitive', opportunity: 65, imd: 29.6, claimants_pct: 3.6,
    ukip_peak: 24.0, ukip_year: 2015, defender: 'Liberal Democrats',
    local_issues: ['Lib Dem complacency (Birtwistle since 1983)', 'social housing (20.8%)', 'medium-high deprivation'],
    messaging: 'Birtwistle margins collapsed: 83% (2006) → 2.4% (2019). 43-year tenure = complacency. Near-miss 2019 (30 votes).',
  },
  'Gawthorpe': {
    tier: 'competitive', opportunity: 60, imd: 40.5, claimants_pct: 5.0,
    ukip_peak: 0, ukip_year: null, defender: 'Labour',
    local_issues: ['high deprivation', 'unemployment 5%', 'housing standards (30.8% private rented)'],
    messaging: 'Labour promised regeneration — Gawthorpe is still waiting.',
  },
  'Rosegrove with Lowerhouse': {
    tier: 'competitive', opportunity: 55, imd: 42.1, claimants_pct: 4.2,
    ukip_peak: 0, ukip_year: null, defender: 'Labour',
    local_issues: ['high deprivation', 'social housing crisis (20.6% social rented)', 'anti-social behaviour'],
    messaging: 'Labour promised to fix social housing — Rosegrove still waiting.',
  },
  'Brunshaw': {
    tier: 'building', opportunity: 40, imd: 39.1, claimants_pct: 5.8,
    ukip_peak: 0, ukip_year: null, defender: 'Labour',
    local_issues: ['social housing quality (29.1% social rented)', 'unemployment above average', 'high deprivation'],
    messaging: 'Working-class ward Labour takes for granted. Social housing neglect.',
  },
  'Gannow': {
    tier: 'building', opportunity: 40, imd: 34.5, claimants_pct: 4.7,
    ukip_peak: 0, ukip_year: null, defender: 'Independent',
    local_issues: ['above-average deprivation', 'private renting growth (25.6%)', 'Independent accountability gap'],
    messaging: 'Independent councillor lacks party infrastructure. Reform offers national movement backing.',
  },
  'Lanehead': {
    tier: 'building', opportunity: 35, imd: 30.3, claimants_pct: 5.5,
    ukip_peak: 0, ukip_year: null, defender: 'Labour',
    local_issues: ['unemployment 5.5%', 'medium-high deprivation', 'social housing maintenance'],
    messaging: 'Labour takes Lanehead for granted. Cost-of-living squeeze demands change.',
  },
  'Rosehill with Burnley Wood': {
    tier: 'building', opportunity: 35, imd: 41.6, claimants_pct: 5.5,
    ukip_peak: 0, ukip_year: null, defender: 'Labour',
    local_issues: ['high deprivation', 'unemployment 5.5%', 'housing quality and street maintenance'],
    messaging: 'Old Labour values, modern Labour neglect. Time for change.',
  },
  'Hapton with Park': {
    tier: 'defend', opportunity: 0, imd: 30.9, claimants_pct: 3.7,
    ukip_peak: 36.6, ukip_year: 2019, defender: 'Reform UK',
    local_issues: ['maintaining Reform representation', 'community infrastructure', 'medium deprivation'],
    messaging: 'Jamie McGowan: proof Reform delivers locally. Easy hold — focus resources elsewhere.',
  },
  'Whittlefield with Ightenhill': {
    tier: 'defend', opportunity: 0, imd: 15.2, claimants_pct: 2.7,
    ukip_peak: 44.4, ukip_year: 2019, defender: 'Reform UK',
    local_issues: ['council tax value', 'protecting community character', 'planning control'],
    messaging: 'Alan Hosker: Reform wins in affluent areas too. Easy hold — credibility anchor.',
  },
  'Briercliffe': {
    tier: 'long_shot', opportunity: 15, imd: 15.3, claimants_pct: 2.3,
    ukip_peak: 0, ukip_year: null, defender: 'Liberal Democrats',
    local_issues: ['council tax value', 'rural road maintenance', 'planning pressures'],
    messaging: 'Affluent Lib Dem fortress. Leaflet only — no canvassing resource.',
  },
  'Cliviger with Worsthorne': {
    tier: 'long_shot', opportunity: 10, imd: 11.7, claimants_pct: 1.2,
    ukip_peak: 0, ukip_year: null, defender: 'Green Party',
    local_issues: ['rural service provision', 'council tax burden', 'countryside planning protection'],
    messaging: 'Least deprived ward. Skip — no Reform opportunity.',
  },
}

/**
 * Generate a complete May 7 2026 Burnley borough election briefing.
 *
 * @param {Object} electionsData - elections.json for Burnley
 * @param {Object|null} deprivationData - deprivation.json
 * @param {Object|null} economyData - economy.json
 * @returns {Object} Comprehensive election briefing
 */
export function getBurnleyElectionBriefing(electionsData, deprivationData = null, economyData = null) {
  const nextElection = electionsData?.meta?.next_election
  if (!nextElection || nextElection.date !== '2026-05-07') {
    return null
  }

  const wardsUp = nextElection.wards_up || []
  const defenders = nextElection.defenders || {}
  const reformCandidates = nextElection.reform_candidates || {}
  const wardIntel = nextElection.ward_intel || {}

  // Build per-ward briefings
  const wardBriefings = wardsUp.map(ward => {
    const defender = defenders[ward] || {}
    const reform = reformCandidates[ward] || {}
    const intel = BURNLEY_WARD_INTEL[ward] || {}
    const wardElections = electionsData?.wards?.[ward]?.history || []
    const latestElection = wardElections[0]

    // Margin trend from last 5 elections
    const recent5 = wardElections.slice(0, 5)
    const margins = recent5.map(e => {
      const sorted = [...(e.candidates || [])].sort((a, b) => b.votes - a.votes)
      if (sorted.length < 2) return null
      return ((sorted[0].votes - sorted[1].votes) / (e.turnout_votes || 1) * 100)
    }).filter(m => m != null)
    const marginTrend = margins.length >= 2
      ? margins[0] < margins[margins.length - 1] ? 'narrowing' : 'widening'
      : 'insufficient_data'

    return {
      ward,
      tier: intel.tier || 'unknown',
      opportunity: intel.opportunity || 0,
      defender: {
        name: defender.name,
        party: defender.party,
        elected_year: defender.elected_year,
      },
      reform_candidate: reform.candidate || 'TBC',
      local_issues: reform.local_issues || intel.local_issues || [],
      tactical_notes: reform.tactical_notes || '',
      messaging: intel.messaging || '',
      imd: intel.imd || null,
      claimants_pct: intel.claimants_pct || null,
      ukip_heritage: intel.ukip_peak > 0 ? { peak_pct: intel.ukip_peak, peak_year: intel.ukip_year } : null,
      margin_trend: marginTrend,
      recent_margins: margins.slice(0, 5),
    }
  })

  // Sort by opportunity (highest first)
  wardBriefings.sort((a, b) => b.opportunity - a.opportunity)

  // Priority tiers
  const tiers = {
    must_win: wardBriefings.filter(w => w.tier === 'must_win'),
    competitive: wardBriefings.filter(w => w.tier === 'competitive'),
    building: wardBriefings.filter(w => w.tier === 'building'),
    defend: wardBriefings.filter(w => w.tier === 'defend'),
    long_shot: wardBriefings.filter(w => w.tier === 'long_shot'),
  }

  // Resource allocation recommendation
  const resourceAllocation = {
    must_win: '50% of canvassing hours — 3-4 door-knocks per ward, weekly street stalls',
    competitive: '30% of canvassing hours — 2-3 door-knocks per ward, targeted leafleting',
    building: '15% of canvassing hours — 1-2 door-knocks, full leaflet coverage',
    defend: '3% — leaflet and election day GOTV only (incumbents do their own work)',
    long_shot: '2% — single leaflet drop, no canvassing',
  }

  // Coalclough deep-dive
  const coalcloughHistory = electionsData?.wards?.['Coalclough with Deerplay']?.history || []
  const coalcloughDeepDive = {
    ward: 'Coalclough with Deerplay',
    defender: 'Gordon Birtwistle (Liberal Democrats)',
    tenure_since: 1983,
    tenure_years: 43,
    margin_trajectory: coalcloughHistory.slice(0, 10).map(e => {
      const sorted = [...(e.candidates || [])].sort((a, b) => b.votes - a.votes)
      const margin = sorted.length >= 2
        ? ((sorted[0].votes - sorted[1].votes) / (e.turnout_votes || 1) * 100).toFixed(1)
        : null
      return { year: e.year, margin_pct: margin ? parseFloat(margin) : null, winner: sorted[0]?.party }
    }),
    vulnerability_analysis: [
      'Margins collapsed from 83% (2006) to 2.4% in 2019 — long-term decline trajectory',
      '2019 near-miss: only 30 votes margin, Independent nearly unseated him',
      '43-year tenure breeds complacency — "when did he last knock on your door?"',
      'UKIP got 24% in 2015 — Reform heritage vote exists but was never consolidated',
      'Medium-high deprivation (IMD 29.6) — residents feel left behind despite Lib Dem promises',
      '2024 rebound to 40% may reflect personal vote rather than party strength — test with strong Reform challenger',
    ],
    recommended_approach: 'Field a strong local candidate with community roots. 4+ door-knocks. Frame as generational change — 43 years is too long. "When did Birtwistle last ask what YOU need?" Don\'t attack him personally — attack the complacency of 40+ years of the same party.',
  }

  return {
    election_date: '2026-05-07',
    election_type: 'Borough election (thirds cycle)',
    seats_contested: 15,
    wards_contested: wardsUp.length,
    current_reform_seats: Object.keys(wardIntel.current_reform_seats || {}).length || 3,
    realistic_target: '5-7 Reform seats (defend 2-3, gain 2-4)',
    ward_briefings: wardBriefings,
    tiers,
    resource_allocation: resourceAllocation,
    coalclough_deep_dive: coalcloughDeepDive,
    ukip_heritage_wards: wardIntel.ukip_heritage_wards || {},
    summary: wardIntel.election_summary || 'May 7 2026: 15 seats, 3 Reform holds, 3 core targets with UKIP heritage.',
  }
}
