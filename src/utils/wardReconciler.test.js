import { describe, it, expect } from 'vitest';
import { normalizeWardName, mergeWardData, buildWardLookup } from './wardReconciler';

// ---------------------------------------------------------------------------
// Test data (subsets from actual West Lancashire, Chorley, Lancaster, Burnley)
// ---------------------------------------------------------------------------

// West Lancashire: 25 census wards → 15 political wards (boundary changes)
const westLancsCensusWards = {
  E05005358: {
    name: 'Aughton and Downholland',
    age: { 'Total: All usual residents': 5000, 'Aged 5 to 9 years': 280 },
    ethnicity: { 'White: English, Welsh, Scottish, Northern Irish or British': 4800, 'Asian, Asian British or Asian Welsh': 50 },
    total_population: 5000,
    avg_imd_score: 11.08,
    avg_imd_rank: 23811,
    avg_imd_decile: 7.3,
    deprivation_level: 'Low',
    national_percentile: 72.5,
    lsoa_count: 3
  },
  E05005359: {
    name: 'Aughton Park',
    age: { 'Total: All usual residents': 4500, 'Aged 5 to 9 years': 250 },
    ethnicity: { 'White: English, Welsh, Scottish, Northern Irish or British': 4300, 'Asian, Asian British or Asian Welsh': 30 },
    total_population: 4500,
    avg_imd_score: 5.3,
    avg_imd_rank: 30145,
    avg_imd_decile: 9.7,
    deprivation_level: 'Very Low',
    national_percentile: 91.8,
    lsoa_count: 3
  },
  E05005360: {
    name: 'Burscough East',
    age: { 'Total: All usual residents': 3000 },
    total_population: 3000
  },
  E05005361: {
    name: 'Burscough West',
    age: { 'Total: All usual residents': 2800 },
    total_population: 2800
  },
  E05005370: {
    name: 'Skelmersdale North',
    age: { 'Total: All usual residents': 4200 },
    total_population: 4200
  },
  E05005371: {
    name: 'Up Holland',
    age: { 'Total: All usual residents': 5100 },
    total_population: 5100
  }
};

const westLancsElectionWards = {
  'Aughton & Holborn': { seats: 3, current_holders: [] },
  'Burscough Bridge & Rufford': { seats: 3, current_holders: [] },
  'Burscough Town': { seats: 3, current_holders: [] },
  'Skelmersdale North': { seats: 3, current_holders: [] },
  'Up Holland': { seats: 3, current_holders: [] }
};

// Chorley: elections uses "and", census uses "&"
const chorleyCensusWards = {
  E05014769: {
    name: 'Buckshaw & Whittle',
    age: { 'Total: All usual residents': 7200 },
    ethnicity: { 'White: English, Welsh, Scottish, Northern Irish or British': 6800 },
    total_population: 7200
  },
  E05014770: {
    name: 'Adlington & Anderton',
    age: { 'Total: All usual residents': 5500 },
    total_population: 5500
  }
};

const chorleyElectionWards = {
  'Buckshaw and Whittle': { seats: 3, current_holders: [] },
  'Adlington and Anderton': { seats: 3, current_holders: [] }
};

// Lancaster: elections uses "Ward" suffix, census does not
const lancasterCensusWards = {
  E05014885: {
    name: 'Bare',
    age: { 'Total: All usual residents': 5555 },
    total_population: 5555
  },
  E05014886: {
    name: 'Bolton & Slyne',
    age: { 'Total: All usual residents': 4300 },
    total_population: 4300
  },
  E05014889: {
    name: 'Castle (Lancaster)',
    age: { 'Total: All usual residents': 3800 },
    total_population: 3800
  }
};

const lancasterElectionWards = {
  'Bare Ward': { seats: 3, current_holders: [] },
  'Bolton & Slyne Ward': { seats: 3, current_holders: [] },
  'Castle Ward': { seats: 3, current_holders: [] }
};

// Burnley: exact match, no discrepancies
const burnleyCensusWards = {
  E05000636: {
    name: 'Hapton with Park',
    age: { 'Total: All usual residents': 4800, 'Aged 5 to 9 years': 310 },
    ethnicity: { 'White: English, Welsh, Scottish, Northern Irish or British': 4500 },
    total_population: 4800
  },
  E05000637: {
    name: 'Bank Hall',
    age: { 'Total: All usual residents': 5200 },
    total_population: 5200
  }
};

const burnleyElectionWards = {
  'Hapton with Park': { seats: 3, current_holders: [] },
  'Bank Hall': { seats: 3, current_holders: [] }
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('normalizeWardName', () => {
  it('strips disambiguation suffix in parentheses', () => {
    expect(normalizeWardName('Castle (Lancaster)')).toBe('castle');
    expect(normalizeWardName('Derby (West Lancashire)')).toBe('derby');
    expect(normalizeWardName('Moorside (West Lancashire)')).toBe('moorside');
    expect(normalizeWardName('Trinity (Burnley)')).toBe('trinity');
  });

  it('replaces ampersand with "and"', () => {
    expect(normalizeWardName('Buckshaw & Whittle')).toBe('buckshaw and whittle');
    expect(normalizeWardName('Aughton & Holborn')).toBe('aughton and holborn');
    expect(normalizeWardName('Adlington & Anderton')).toBe('adlington and anderton');
  });

  it('strips trailing "Ward" suffix', () => {
    expect(normalizeWardName('Bare Ward')).toBe('bare');
    expect(normalizeWardName('Bolton & Slyne Ward')).toBe('bolton and slyne');
    expect(normalizeWardName('Castle Ward')).toBe('castle');
  });

  it('handles combined normalization', () => {
    // Disambiguation + Ward suffix (hypothetical)
    expect(normalizeWardName('Overton (Lancaster) Ward')).toBe('overton');
  });

  it('returns empty string for falsy input', () => {
    expect(normalizeWardName(null)).toBe('');
    expect(normalizeWardName(undefined)).toBe('');
    expect(normalizeWardName('')).toBe('');
  });

  it('preserves "with" in ward names', () => {
    expect(normalizeWardName('Hapton with Park')).toBe('hapton with park');
    expect(normalizeWardName('Cliviger with Worsthorne')).toBe('cliviger with worsthorne');
  });

  it('lowercases and trims', () => {
    expect(normalizeWardName('  Bare Ward  ')).toBe('bare');
    expect(normalizeWardName('BURNLEY WOOD')).toBe('burnley wood');
  });
});

describe('buildWardLookup', () => {
  it('handles exact match (Burnley)', () => {
    const { lookup } = buildWardLookup(burnleyElectionWards, burnleyCensusWards);
    const result = lookup('Hapton with Park');
    expect(result).not.toBeNull();
    expect(result.name).toBe('Hapton with Park');
    expect(result.total_population).toBe(4800);
  });

  it('handles ampersand normalization (Chorley: elections "and" → census "&")', () => {
    const { lookup } = buildWardLookup(chorleyElectionWards, chorleyCensusWards);
    const result = lookup('Buckshaw and Whittle');
    expect(result).not.toBeNull();
    expect(result.total_population).toBe(7200);
  });

  it('handles Ward suffix normalization (Lancaster)', () => {
    const { lookup } = buildWardLookup(lancasterElectionWards, lancasterCensusWards);
    const bare = lookup('Bare Ward');
    expect(bare).not.toBeNull();
    expect(bare.total_population).toBe(5555);
  });

  it('handles disambiguation + Ward suffix (Lancaster Castle)', () => {
    const { lookup } = buildWardLookup(lancasterElectionWards, lancasterCensusWards);
    // Election: "Castle Ward" → Census: "Castle (Lancaster)"
    // Both normalize to "castle"
    const castle = lookup('Castle Ward');
    expect(castle).not.toBeNull();
    expect(castle.total_population).toBe(3800);
  });

  it('handles boundary merge via prefix match (West Lancashire Burscough)', () => {
    const { lookup, lookupAll } = buildWardLookup(westLancsElectionWards, westLancsCensusWards);
    // "Burscough Town" should match "Burscough East" + "Burscough West" via prefix
    const matches = lookupAll('Burscough Town');
    expect(matches.length).toBe(2);
    const merged = lookup('Burscough Town');
    expect(merged).not.toBeNull();
    expect(merged.total_population).toBe(5800); // 3000 + 2800
  });

  it('handles compound ward merge (West Lancashire Aughton & Holborn)', () => {
    const { lookup, lookupAll } = buildWardLookup(westLancsElectionWards, westLancsCensusWards);
    // "Aughton & Holborn" → should find "Aughton and Downholland" + "Aughton Park"
    const matches = lookupAll('Aughton & Holborn');
    expect(matches.length).toBe(2);
    const merged = lookup('Aughton & Holborn');
    expect(merged).not.toBeNull();
    expect(merged.total_population).toBe(9500); // 5000 + 4500
    expect(merged.name).toContain('merged');
    expect(merged.name).toContain('Aughton and Downholland');
    expect(merged.name).toContain('Aughton Park');
  });

  it('handles exact match for wards that exist in both (Skelmersdale North)', () => {
    const { lookup } = buildWardLookup(westLancsElectionWards, westLancsCensusWards);
    const result = lookup('Skelmersdale North');
    expect(result).not.toBeNull();
    expect(result.name).toBe('Skelmersdale North');
    expect(result.total_population).toBe(4200);
  });

  it('returns null for non-existent ward', () => {
    const { lookup } = buildWardLookup(burnleyElectionWards, burnleyCensusWards);
    expect(lookup('Nonexistent Ward')).toBeNull();
  });

  it('returns empty array for lookupAll on non-existent ward', () => {
    const { lookup, lookupAll } = buildWardLookup(burnleyElectionWards, burnleyCensusWards);
    expect(lookupAll('Nonexistent Ward')).toEqual([]);
  });

  it('returns safe defaults for null inputs', () => {
    const { lookup, lookupAll } = buildWardLookup(null, null);
    expect(lookup('Test')).toBeNull();
    expect(lookupAll('Test')).toEqual([]);
  });
});

describe('mergeWardData', () => {
  it('sums population and category values', () => {
    const wards = [
      westLancsCensusWards.E05005358, // Aughton and Downholland
      westLancsCensusWards.E05005359  // Aughton Park
    ];
    const merged = mergeWardData(wards);
    expect(merged.total_population).toBe(9500);
    expect(merged.age['Total: All usual residents']).toBe(9500);
    expect(merged.age['Aged 5 to 9 years']).toBe(530); // 280 + 250
    expect(merged.ethnicity['White: English, Welsh, Scottish, Northern Irish or British']).toBe(9100); // 4800 + 4300
    expect(merged.ethnicity['Asian, Asian British or Asian Welsh']).toBe(80); // 50 + 30
  });

  it('takes worst (most deprived) deprivation score', () => {
    const wards = [
      westLancsCensusWards.E05005358, // imd_score=11.08, decile=7.3
      westLancsCensusWards.E05005359  // imd_score=5.3,  decile=9.7
    ];
    const merged = mergeWardData(wards);
    // Highest score = most deprived → 11.08
    expect(merged.avg_imd_score).toBe(11.08);
    // Lowest rank = most deprived → 23811
    expect(merged.avg_imd_rank).toBe(23811);
    // Lowest decile = most deprived → 7.3
    expect(merged.avg_imd_decile).toBe(7.3);
    // Lowest percentile = most deprived → 72.5
    expect(merged.national_percentile).toBe(72.5);
    // Sum LSOA counts → 6
    expect(merged.lsoa_count).toBe(6);
  });

  it('returns single ward unchanged', () => {
    const wards = [westLancsCensusWards.E05005358];
    const result = mergeWardData(wards);
    expect(result).toBe(wards[0]); // same reference
  });

  it('returns null for empty input', () => {
    expect(mergeWardData([])).toBeNull();
    expect(mergeWardData(null)).toBeNull();
  });

  it('creates merged name with component ward names', () => {
    const wards = [
      westLancsCensusWards.E05005358,
      westLancsCensusWards.E05005359
    ];
    const merged = mergeWardData(wards);
    expect(merged.name).toContain('merged');
    expect(merged.name).toContain('Aughton and Downholland');
    expect(merged.name).toContain('Aughton Park');
  });

  it('handles wards with housing data (tenure, accommodation)', () => {
    const wards = [
      { name: 'Ward A', tenure: { 'Total: All households': 2000, 'Owned': 1500 } },
      { name: 'Ward B', tenure: { 'Total: All households': 1800, 'Owned': 1200 } }
    ];
    const merged = mergeWardData(wards);
    expect(merged.tenure['Total: All households']).toBe(3800);
    expect(merged.tenure['Owned']).toBe(2700);
  });

  it('assigns deprivation level from worst decile', () => {
    const wards = [
      { name: 'Deprived', avg_imd_decile: 1.5, avg_imd_score: 45 },
      { name: 'Affluent', avg_imd_decile: 9.0, avg_imd_score: 5 }
    ];
    const merged = mergeWardData(wards);
    expect(merged.deprivation_level).toBe('Very High');
    expect(merged.avg_imd_decile).toBe(1.5);
  });
});

describe('lookupAll', () => {
  it('returns array of raw matches before merging', () => {
    const { lookupAll } = buildWardLookup(
      { 'Aughton & Holborn': { seats: 3 } },
      westLancsCensusWards
    );
    const matches = lookupAll('Aughton & Holborn');
    expect(Array.isArray(matches)).toBe(true);
    expect(matches.length).toBe(2);
    const names = matches.map(m => m.name).sort();
    expect(names).toEqual(['Aughton Park', 'Aughton and Downholland']);
  });

  it('returns single-element array for exact match', () => {
    const { lookupAll } = buildWardLookup(burnleyElectionWards, burnleyCensusWards);
    const matches = lookupAll('Hapton with Park');
    expect(matches.length).toBe(1);
    expect(matches[0].name).toBe('Hapton with Park');
  });
});
