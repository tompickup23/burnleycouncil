/**
 * Ward name reconciliation between elections.json (political ward names)
 * and Census/GSS-coded data sources (demographics, housing, economy, health, deprivation).
 *
 * Handles 4 categories of mismatch:
 * 1. Ampersand vs "and": "Buckshaw & Whittle" vs "Buckshaw and Whittle"
 * 2. Disambiguation suffix: "Castle (Lancaster)" vs "Castle"
 * 3. "Ward" suffix: "Bare Ward" vs "Bare"
 * 4. Boundary changes: West Lancashire has 25 census wards → 15 political wards
 */

/**
 * Normalize a ward name for fuzzy comparison.
 * Strips disambiguation suffixes, ampersand variants, and "Ward" suffix.
 * @param {string} name - Ward name to normalize
 * @returns {string} Normalized lowercase name
 */
export function normalizeWardName(name) {
  if (!name) return '';
  let n = name.trim();
  // 1. Strip trailing " Ward" first (before disambiguation, in case of "X (Place) Ward")
  n = n.replace(/\s+Ward$/i, '');
  // 2. Strip disambiguation: " (Blackpool)", " (Lancaster)", " (West Lancashire)" etc.
  n = n.replace(/\s*\([^)]+\)\s*$/, '');
  // 3. Replace " & " with " and "
  n = n.replace(/\s*&\s*/g, ' and ');
  // 4. Trim and lowercase
  return n.trim().toLowerCase();
}

/**
 * Merge multiple census ward data objects into one combined record.
 * Sums population/household counts and category values.
 * Takes worst-case for deprivation scores.
 * @param {Array<Object>} censusWards - Array of ward data objects
 * @returns {Object} Merged ward data
 */
export function mergeWardData(censusWards) {
  if (!censusWards || censusWards.length === 0) return null;
  if (censusWards.length === 1) return censusWards[0];

  const merged = {};
  const names = censusWards.map(w => w.name).filter(Boolean);
  merged.name = `${names[0]} (merged: ${names.join(', ')})`;

  // Category object keys that should be summed
  const categoryKeys = [
    'ethnicity', 'religion', 'age', 'sex', 'country_of_birth',
    'economic_activity', 'tenure', 'accommodation_type', 'overcrowding',
    'bedrooms', 'household_size'
  ];

  // Simple numeric keys to sum
  const sumKeys = ['total_population'];

  // Deprivation keys - take worst case
  const deprivationKeys = [
    'avg_imd_score', 'avg_imd_rank', 'avg_imd_decile',
    'national_percentile', 'most_deprived_lsoa_rank'
  ];

  // Sum total_population
  for (const key of sumKeys) {
    const values = censusWards.map(w => w[key]).filter(v => typeof v === 'number');
    if (values.length > 0) {
      merged[key] = values.reduce((a, b) => a + b, 0);
    }
  }

  // Merge category objects by summing numeric values
  for (const catKey of categoryKeys) {
    const objs = censusWards.map(w => w[catKey]).filter(Boolean);
    if (objs.length === 0) continue;

    merged[catKey] = {};
    const allKeys = new Set();
    for (const obj of objs) {
      for (const k of Object.keys(obj)) allKeys.add(k);
    }
    for (const k of allKeys) {
      const values = objs.map(o => o[k]).filter(v => typeof v === 'number');
      if (values.length > 0) {
        merged[catKey][k] = values.reduce((a, b) => a + b, 0);
      }
    }
  }

  // Deprivation: worst case (highest score = most deprived, lowest decile = most deprived)
  const depObjs = censusWards.filter(w =>
    w.avg_imd_score != null || w.avg_imd_decile != null
  );
  if (depObjs.length > 0) {
    // Highest IMD score = most deprived
    const scores = depObjs.map(w => w.avg_imd_score).filter(v => typeof v === 'number');
    if (scores.length > 0) merged.avg_imd_score = Math.max(...scores);

    // Lowest rank = most deprived (rank 1 = most deprived nationally)
    const ranks = depObjs.map(w => w.avg_imd_rank).filter(v => typeof v === 'number');
    if (ranks.length > 0) merged.avg_imd_rank = Math.min(...ranks);

    // Lowest decile = most deprived
    const deciles = depObjs.map(w => w.avg_imd_decile).filter(v => typeof v === 'number');
    if (deciles.length > 0) merged.avg_imd_decile = Math.min(...deciles);

    // Lowest national percentile = most deprived
    const pcts = depObjs.map(w => w.national_percentile).filter(v => typeof v === 'number');
    if (pcts.length > 0) merged.national_percentile = Math.min(...pcts);

    // Deprivation level from worst decile
    const worstDecile = merged.avg_imd_decile;
    if (worstDecile != null) {
      if (worstDecile <= 2) merged.deprivation_level = 'Very High';
      else if (worstDecile <= 4) merged.deprivation_level = 'High';
      else if (worstDecile <= 6) merged.deprivation_level = 'Medium';
      else if (worstDecile <= 8) merged.deprivation_level = 'Low';
      else merged.deprivation_level = 'Very Low';
    }

    // Sum LSOA counts
    const lsoaCounts = depObjs.map(w => w.lsoa_count).filter(v => typeof v === 'number');
    if (lsoaCounts.length > 0) merged.lsoa_count = lsoaCounts.reduce((a, b) => a + b, 0);
  }

  return merged;
}

/**
 * Build a ward lookup that reconciles election ward names to census ward data.
 * Builds the mapping once, then provides O(1) access via lookup()/lookupAll().
 *
 * @param {Object} electionWards - Object from elections.json .wards (keys = ward names)
 * @param {Object} censusWardsObj - Object from demographics.json .wards (keys = GSS codes, each has .name)
 * @returns {{ lookup: (name: string) => Object|null, lookupAll: (name: string) => Array<Object> }}
 */
export function buildWardLookup(electionWards, censusWardsObj) {
  if (!electionWards || !censusWardsObj) {
    return { lookup: () => null, lookupAll: () => [] };
  }

  // Index census wards by name and normalized name
  const censusByName = new Map();
  const censusByNorm = new Map();
  const censusEntries = [];

  for (const [gssCode, data] of Object.entries(censusWardsObj)) {
    if (!data || !data.name) continue;
    const entry = { ...data, gss_code: gssCode };
    censusEntries.push(entry);
    censusByName.set(data.name, entry);

    const norm = normalizeWardName(data.name);
    if (!censusByNorm.has(norm)) {
      censusByNorm.set(norm, []);
    }
    censusByNorm.get(norm).push(entry);
  }

  const resultMap = new Map(); // wardName → merged data
  const matchesMap = new Map(); // wardName → [raw matches]

  for (const wardName of Object.keys(electionWards)) {
    let matches = [];

    // Phase 1 - Exact match
    if (censusByName.has(wardName)) {
      matches = [censusByName.get(wardName)];
    }

    // Phase 2 - Normalized match
    if (matches.length === 0) {
      const norm = normalizeWardName(wardName);
      const normMatches = censusByNorm.get(norm);
      if (normMatches && normMatches.length > 0) {
        matches = normMatches;
      }
    }

    // Phase 3 - Prefix match (census name starts with first word of election name)
    if (matches.length === 0) {
      const norm = normalizeWardName(wardName);
      const firstWord = norm.split(/\s+/)[0];
      if (firstWord && firstWord.length >= 3) {
        matches = censusEntries.filter(e =>
          normalizeWardName(e.name).startsWith(firstWord)
        );
      }
    }

    // Phase 4 - Token overlap / compound ward splitting
    if (matches.length === 0) {
      const norm = normalizeWardName(wardName);
      // Split compound wards on " and " (already normalized from &)
      const parts = norm.split(/\s+and\s+/).map(s => s.trim()).filter(Boolean);

      if (parts.length > 1) {
        // For compound wards, find census wards matching each part
        for (const part of parts) {
          const partTokens = part.split(/\s+/).filter(t => t.length >= 3);
          for (const entry of censusEntries) {
            const entryNorm = normalizeWardName(entry.name);
            const entryTokens = entryNorm.split(/\s+/).filter(t => t.length >= 3);
            const shared = partTokens.filter(t => entryTokens.includes(t));
            if (shared.length > 0 && shared.length >= Math.min(partTokens.length, 1)) {
              if (!matches.includes(entry)) matches.push(entry);
            }
          }
        }
      } else {
        // Single ward - find best token overlap
        const tokens = norm.split(/\s+/).filter(t => t.length >= 3);
        let bestScore = 0;
        let bestMatches = [];

        for (const entry of censusEntries) {
          const entryNorm = normalizeWardName(entry.name);
          const entryTokens = entryNorm.split(/\s+/).filter(t => t.length >= 3);
          const shared = tokens.filter(t => entryTokens.includes(t));
          if (shared.length > bestScore) {
            bestScore = shared.length;
            bestMatches = [entry];
          } else if (shared.length === bestScore && shared.length > 0) {
            bestMatches.push(entry);
          }
        }
        if (bestScore > 0) matches = bestMatches;
      }
    }

    matchesMap.set(wardName, matches);
    if (matches.length === 1) {
      resultMap.set(wardName, matches[0]);
    } else if (matches.length > 1) {
      resultMap.set(wardName, mergeWardData(matches));
    }
  }

  return {
    /**
     * Look up merged census data for an election ward name.
     * @param {string} name - Election ward name
     * @returns {Object|null} Merged census data or null if no match
     */
    lookup(name) {
      return resultMap.get(name) ?? null;
    },

    /**
     * Get all raw census ward matches for an election ward name.
     * @param {string} name - Election ward name
     * @returns {Array<Object>} Array of matching census ward objects
     */
    lookupAll(name) {
      return matchesMap.get(name) ?? [];
    }
  };
}
