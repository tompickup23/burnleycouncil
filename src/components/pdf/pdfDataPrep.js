/**
 * pdfDataPrep.js — Data preparation module for Strategy PDF system.
 *
 * Bridges raw JSON data (demographics, housing, economy, health, deprivation)
 * to clean normalised objects for PDF components.
 *
 * Works across all 15 Lancashire councils. Census data is keyed by GSS code
 * with a `name` property inside each ward entry. Political wards (from
 * elections.json / wards.json) are matched to census wards by name.
 */

// ── Ward lookup builder ──
// Census data files key wards by GSS code (e.g. "E05005150") with a `name`
// property inside. Political wards use the name string directly. This lookup
// bridges the two by building a name → data map.

/**
 * Build a name-keyed lookup from a GSS-keyed census wards object.
 * Handles demographics.wards, housing.census.wards, economy.claimant_count.wards,
 * economy.census.wards, health.census.wards, deprivation.wards (already name-keyed).
 *
 * @param {Object} wardsObj - GSS-keyed or name-keyed ward data
 * @returns {{ byName: Object<string, Object>, lookup: function(string): Object|null }}
 */
export function buildWardLookup(wardsObj) {
  if (!wardsObj || typeof wardsObj !== 'object') {
    return { byName: {}, lookup: () => null }
  }

  const byName = {}
  for (const [key, val] of Object.entries(wardsObj)) {
    if (!val) continue
    // Census data: GSS code key with name property inside
    const name = val.name || val.ward_name || key
    const normalised = name.toLowerCase().trim()
    // Store by normalised name. If duplicate (shouldn't happen), first wins
    if (!byName[normalised]) {
      byName[normalised] = val
    }
  }

  function lookup(wardName) {
    if (!wardName) return null
    const normalised = wardName.toLowerCase().trim()
    return byName[normalised] || null
  }

  return { byName, lookup }
}

// ── Ethnicity extraction ──

const TOP_LEVEL_ETHNIC_GROUPS = [
  'White',
  'Asian, Asian British or Asian Welsh',
  'Black, Black British, Black Welsh, Caribbean or African',
  'Mixed or Multiple ethnic groups',
  'Other ethnic group',
]

function extractEthnicity(ethnicityObj) {
  if (!ethnicityObj) return null
  const total = ethnicityObj['Total: All usual residents'] || 0
  if (total === 0) return null

  const groups = TOP_LEVEL_ETHNIC_GROUPS
    .map(name => ({ name: name.split(',')[0].trim(), count: ethnicityObj[name] || 0 }))
    .filter(g => g.count > 0)
    .sort((a, b) => b.count - a.count)
    .map(g => ({ ...g, pct: +(g.count / total * 100).toFixed(1) }))

  return { topGroups: groups, total }
}

// ── Religion extraction ──

const SKIP_RELIGION_KEYS = ['Total: All usual residents']

function extractReligion(religionObj) {
  if (!religionObj) return null
  const total = religionObj['Total: All usual residents'] || 0
  if (total === 0) return null

  const groups = Object.entries(religionObj)
    .filter(([k]) => !SKIP_RELIGION_KEYS.includes(k))
    .map(([name, count]) => ({ name, count }))
    .filter(g => g.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(g => ({ ...g, pct: +(g.count / total * 100).toFixed(1) }))

  return { topGroups: groups, total }
}

// ── Age profile extraction ──

function extractAge(ageObj) {
  if (!ageObj) return null
  const total = ageObj['Total: All usual residents'] || 0
  if (total === 0) return null

  // Sum age bands
  const under18 =
    (ageObj['Aged 4 years and under'] || 0) +
    (ageObj['Aged 5 to 9 years'] || 0) +
    (ageObj['Aged 10 to 15 years'] || 0) +
    (ageObj['Aged 16 to 19 years'] || 0) * 0.5 // 16-17 are under 18

  const over65 =
    (ageObj['Aged 65 to 74 years'] || 0) +
    (ageObj['Aged 75 to 84 years'] || 0) +
    (ageObj['Aged 85 years and over'] || 0)

  const workingAge = total - under18 - over65

  // Approximate median from age bands (rough midpoint estimation)
  let cumulative = 0
  const bands = [
    { label: '0-4', count: ageObj['Aged 4 years and under'] || 0, mid: 2 },
    { label: '5-9', count: ageObj['Aged 5 to 9 years'] || 0, mid: 7 },
    { label: '10-15', count: ageObj['Aged 10 to 15 years'] || 0, mid: 12.5 },
    { label: '16-19', count: ageObj['Aged 16 to 19 years'] || 0, mid: 17.5 },
    { label: '20-24', count: ageObj['Aged 20 to 24 years'] || 0, mid: 22 },
    { label: '25-34', count: ageObj['Aged 25 to 34 years'] || 0, mid: 29.5 },
    { label: '35-49', count: ageObj['Aged 35 to 49 years'] || 0, mid: 42 },
    { label: '50-64', count: ageObj['Aged 50 to 64 years'] || 0, mid: 57 },
    { label: '65-74', count: ageObj['Aged 65 to 74 years'] || 0, mid: 69.5 },
    { label: '75-84', count: ageObj['Aged 75 to 84 years'] || 0, mid: 79.5 },
    { label: '85+', count: ageObj['Aged 85 years and over'] || 0, mid: 89 },
  ]
  const half = total / 2
  let median = 40 // default fallback
  for (const b of bands) {
    cumulative += b.count
    if (cumulative >= half) {
      median = b.mid
      break
    }
  }

  return {
    median: Math.round(median),
    under18pct: +(under18 / total * 100).toFixed(1),
    over65pct: +(over65 / total * 100).toFixed(1),
    workingAgePct: +(workingAge / total * 100).toFixed(1),
  }
}

// ── Housing extraction ──

function extractTenure(tenureObj) {
  if (!tenureObj) return null
  const total = tenureObj['Total: All households'] || 0
  if (total === 0) return null

  const owned = tenureObj['Owned'] || 0
  const socialRent = tenureObj['Social rented'] || 0
  const privateRent = tenureObj['Private rented'] || 0

  return {
    owned,
    socialRent,
    privateRent,
    total,
    pctOwned: +(owned / total * 100).toFixed(1),
    pctRent: +((socialRent + privateRent) / total * 100).toFixed(1),
  }
}

function extractHouseType(accommodationObj) {
  if (!accommodationObj) return null
  const detached = accommodationObj['Detached'] || 0
  const semi = accommodationObj['Semi-detached'] || 0
  const terraced = accommodationObj['Terraced'] || 0
  const flat = (accommodationObj['In a purpose-built block of flats or tenement'] || 0) +
    (accommodationObj['Part of a converted or shared house, including bedsits'] || 0)

  const types = [
    { name: 'Detached', count: detached },
    { name: 'Semi-detached', count: semi },
    { name: 'Terraced', count: terraced },
    { name: 'Flat', count: flat },
  ]
  const predominant = types.reduce((a, b) => (b.count > a.count ? b : a), types[0])

  return { predominant: predominant.name, detached, semi, terraced, flat }
}

function extractOvercrowding(overcrowdingObj) {
  if (!overcrowdingObj) return null
  const total = overcrowdingObj['Total: All households'] || 0
  if (total === 0) return null
  const overcrowded =
    (overcrowdingObj['Occupancy rating of bedrooms: -1'] || 0) +
    (overcrowdingObj['Occupancy rating of bedrooms: -2 or less'] || 0)
  return { pct: +(overcrowded / total * 100).toFixed(1) }
}

// ── Health extraction ──

function extractHealth(healthWard, indicators) {
  const lifeExpMale = indicators?.life_expectancy_male?.value ?? null
  const lifeExpFemale = indicators?.life_expectancy_female?.value ?? null

  let goodHealthPct = null
  if (healthWard?.general_health) {
    const gh = healthWard.general_health
    const total = Object.values(gh).reduce((s, v) => s + (v || 0), 0)
    if (total > 0) {
      const good = (gh['Very good health'] || 0) + (gh['Good health'] || 0)
      goodHealthPct = +(good / total * 100).toFixed(1)
    }
  }

  return { lifeExpMale, lifeExpFemale, goodHealthPct }
}

// ── Economy extraction ──

function extractEconomy(claimantWard, ashe, censusWard) {
  const claimantRate = claimantWard?.rate_pct ?? claimantWard?.rate ?? null
  const claimantCount = claimantWard?.count ?? null
  const medianEarnings = ashe?.median_annual_pay ?? ashe?.median_annual ?? null

  let topIndustry = null
  if (censusWard?.industry) {
    let maxCount = 0
    for (const [name, count] of Object.entries(censusWard.industry)) {
      if (count > maxCount) {
        maxCount = count
        topIndustry = name
      }
    }
  }

  return { claimantRate, claimantCount, medianEarnings, topIndustry }
}

// ── Main: prepare single ward ──

/**
 * Prepare clean ward data for PDF rendering.
 *
 * @param {string} wardName - Political ward name
 * @param {Object} dataSources - Raw JSON data objects
 * @param {Object} dataSources.demographics - demographics.json
 * @param {Object} dataSources.deprivation - deprivation.json
 * @param {Object} dataSources.housing - housing.json
 * @param {Object} dataSources.economy - economy.json
 * @param {Object} dataSources.health - health.json
 * @returns {Object|null} Normalised ward data or null if nothing found
 */
export function prepareWardData(wardName, { demographics, deprivation, housing, economy, health }) {
  if (!wardName) return null

  // Build lookups for each data source
  const demoLookup = buildWardLookup(demographics?.wards)
  const housingLookup = buildWardLookup(housing?.census?.wards)
  const econClaimantLookup = buildWardLookup(economy?.claimant_count?.wards)
  const econCensusLookup = buildWardLookup(economy?.census?.wards)
  const healthLookup = buildWardLookup(health?.census?.wards)

  // Deprivation is already name-keyed (not GSS)
  const depWard = deprivation?.wards?.[wardName] || null

  const demoWard = demoLookup.lookup(wardName)
  const housingWard = housingLookup.lookup(wardName)
  const claimantWard = econClaimantLookup.lookup(wardName)
  const econCensusWard = econCensusLookup.lookup(wardName)
  const healthWard = healthLookup.lookup(wardName)

  // If we have absolutely nothing, return null
  if (!demoWard && !depWard && !housingWard && !claimantWard && !healthWard) return null

  const population = demoWard?.age?.['Total: All usual residents'] ?? null

  return {
    population,
    imdDecile: depWard?.avg_imd_decile ?? null,
    imdScore: depWard?.avg_imd_score ?? null,
    tenure: extractTenure(housingWard?.tenure),
    ethnicity: extractEthnicity(demoWard?.ethnicity),
    religion: extractReligion(demoWard?.religion),
    age: extractAge(demoWard?.age),
    economy: extractEconomy(claimantWard, economy?.earnings ?? economy?.ashe, econCensusWard),
    health: extractHealth(healthWard, health?.indicators),
    houseType: extractHouseType(housingWard?.accommodation_type),
    overcrowding: extractOvercrowding(housingWard?.overcrowding),
  }
}

// ── Prepare all wards ──

/**
 * Prepare data for all wards up for election.
 *
 * @param {string[]} wardsUp - Array of ward names
 * @param {Object} allData - { demographics, deprivation, housing, economy, health }
 * @returns {Map<string, Object>} wardName → wardData
 */
export function prepareBoroughData(wardsUp, allData) {
  const map = new Map()
  if (!wardsUp?.length) return map
  for (const wardName of wardsUp) {
    const wd = prepareWardData(wardName, allData)
    if (wd) map.set(wardName, wd)
  }
  return map
}

// ── Borough aggregates ──

/**
 * Aggregate borough-level stats from all ward data.
 *
 * @param {Map<string, Object>} wardDataMap - from prepareBoroughData()
 * @returns {Object} Borough-level aggregates
 */
export function buildBoroughAggregates(wardDataMap) {
  let totalPopulation = 0
  let imdSum = 0
  let imdCount = 0
  let ownedTotal = 0
  let rentTotal = 0
  let tenureTotal = 0
  let claimantSum = 0
  let claimantCount = 0

  for (const wd of wardDataMap.values()) {
    if (wd.population) totalPopulation += wd.population
    if (wd.imdScore != null) { imdSum += wd.imdScore; imdCount++ }
    if (wd.tenure) {
      ownedTotal += wd.tenure.owned
      rentTotal += wd.tenure.socialRent + wd.tenure.privateRent
      tenureTotal += wd.tenure.total
    }
    if (wd.economy?.claimantRate != null) {
      claimantSum += wd.economy.claimantRate
      claimantCount++
    }
  }

  return {
    totalPopulation,
    avgImd: imdCount > 0 ? +(imdSum / imdCount).toFixed(1) : null,
    tenureSplit: tenureTotal > 0 ? {
      pctOwned: +(ownedTotal / tenureTotal * 100).toFixed(1),
      pctRent: +(rentTotal / tenureTotal * 100).toFixed(1),
    } : null,
    avgClaimantRate: claimantCount > 0 ? +(claimantSum / claimantCount).toFixed(1) : null,
    wardCount: wardDataMap.size,
  }
}

// ── Competitor analysis ──

/**
 * Build competitor analysis from election data.
 *
 * @param {string[]} wardsUp - Wards up for election
 * @param {Object} electionsData - elections.json (wards keyed by ward name)
 * @param {Object} politicsSummary - politics_summary.json
 * @returns {Object} { parties: [{name, seats, strongWards, weakWards, trend}] }
 */
export function buildCompetitorAnalysis(wardsUp, electionsData, politicsSummary) {
  const partyMap = {}
  const wardsObj = electionsData?.wards || {}

  for (const wardName of (wardsUp || [])) {
    const ward = wardsObj[wardName]
    if (!ward) continue
    const holders = ward.current_holders || ward.councillors || []
    for (const h of holders) {
      const party = h.party || 'Unknown'
      if (!partyMap[party]) partyMap[party] = { seats: 0, strongWards: [], weakWards: [] }
      partyMap[party].seats++
    }

    // Check latest election result for margin analysis
    const history = ward.history || ward.results || []
    const latest = history[0]
    if (!latest?.candidates?.length && !latest?.results?.length) continue
    const candidates = latest.candidates || latest.results || []
    const sorted = [...candidates].sort((a, b) => (b.votes || 0) - (a.votes || 0))
    if (sorted.length < 2) continue

    const winner = sorted[0]
    const runnerUp = sorted[1]
    const margin = (winner.votes || 0) - (runnerUp.votes || 0)
    const winnerParty = winner.party || 'Unknown'

    if (margin < 100) {
      if (!partyMap[winnerParty]) partyMap[winnerParty] = { seats: 0, strongWards: [], weakWards: [] }
      partyMap[winnerParty].weakWards.push(wardName)
    } else if (margin > 500) {
      if (!partyMap[winnerParty]) partyMap[winnerParty] = { seats: 0, strongWards: [], weakWards: [] }
      partyMap[winnerParty].strongWards.push(wardName)
    }
  }

  // Add total seats from politics_summary if available
  const summaryParties = politicsSummary?.parties || politicsSummary?.seats || {}
  for (const [party, count] of Object.entries(summaryParties)) {
    if (!partyMap[party]) partyMap[party] = { seats: 0, strongWards: [], weakWards: [] }
    // Use summary total if larger (includes wards not up for election)
    if (typeof count === 'number' && count > partyMap[party].seats) {
      partyMap[party].seats = count
    }
  }

  const parties = Object.entries(partyMap)
    .map(([name, data]) => ({
      name,
      seats: data.seats,
      strongWards: data.strongWards.slice(0, 5),
      weakWards: data.weakWards.slice(0, 5),
      trend: null, // could be derived from multi-year history
    }))
    .sort((a, b) => b.seats - a.seats)

  return { parties }
}

// ── Election timeline ──

/**
 * Build 8-week countdown to election day.
 *
 * @param {string} electionDate - ISO date string (e.g. "2026-05-07")
 * @returns {Array<{week: number, date: string, milestone: string}>}
 */
export function buildElectionTimeline(electionDate) {
  if (!electionDate) return []

  const eDay = new Date(electionDate)
  if (isNaN(eDay.getTime())) return []

  const milestones = [
    { week: -8, milestone: 'Campaign launch, leaflet design sign-off' },
    { week: -7, milestone: 'First leaflet drop, canvassing teams assigned' },
    { week: -6, milestone: 'Postal vote applications deadline approaching' },
    { week: -5, milestone: 'Nomination papers deadline (typically T-25 working days)' },
    { week: -4, milestone: 'Intensive canvassing begins, social media push' },
    { week: -3, milestone: 'Second leaflet drop, pledge card distribution' },
    { week: -2, milestone: 'Final canvassing sweep, target soft voters' },
    { week: -1, milestone: 'GOTV preparation, polling day logistics confirmed' },
    { week: 0, milestone: 'ELECTION DAY — knock up, tellers, count' },
  ]

  return milestones.map(m => {
    const d = new Date(eDay)
    d.setDate(d.getDate() + m.week * 7)
    return {
      week: m.week,
      date: d.toISOString().slice(0, 10),
      milestone: m.milestone,
    }
  })
}
