import { describe, it, expect } from 'vitest';
import { scorePlanning } from '../src/scoring/planning.js';
import type { PlanningInputs } from '../src/scoring/planning.js';
import type { NearbyWindFarm } from '../src/datasources/osm-overpass.js';
import type { ReverseGeocodeResult } from '../src/datasources/nominatim.js';

function makeGeocode(overrides: Partial<ReverseGeocodeResult> = {}): ReverseGeocodeResult {
  return {
    countryCode: 'GB',
    country: 'United Kingdom',
    region: 'Scotland',
    displayName: 'Glasgow, Scotland, United Kingdom',
    ...overrides,
  };
}

function makeInputs(overrides: Partial<PlanningInputs> = {}): PlanningInputs {
  return {
    geocode: makeGeocode(),
    nearbyWindFarms: [],
    residentialDensityProxy: 3,
    ...overrides,
  };
}

describe('scorePlanning', () => {
  it('returns a valid FactorScore for planningFeasibility', () => {
    const result = scorePlanning(makeInputs(), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factor).toBe('planningFeasibility');
      expect(result.value.weight).toBe(0.1);
      expect(result.value.score).toBeGreaterThanOrEqual(0);
      expect(result.value.score).toBeLessThanOrEqual(100);
      expect(result.value.dataSource).toContain('Nominatim');
    }
  });

  // --- Country context ---

  it('boosts score for favourable country (GB)', () => {
    const result = scorePlanning(makeInputs({ geocode: makeGeocode({ countryCode: 'GB' }) }), 0.1);
    const noCountry = scorePlanning(makeInputs({ geocode: null }), 0.1);
    expect(result.ok && noCountry.ok).toBe(true);
    if (result.ok && noCountry.ok) {
      expect(result.value.score).toBeGreaterThan(noCountry.value.score);
    }
  });

  it('boosts score for favourable country (DE)', () => {
    const result = scorePlanning(
      makeInputs({ geocode: makeGeocode({ countryCode: 'DE', country: 'Germany' }) }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('Germany');
      expect(result.value.detail).toContain('favourable');
    }
  });

  it('does not penalise non-favourable countries', () => {
    const result = scorePlanning(
      makeInputs({ geocode: makeGeocode({ countryCode: 'JP', country: 'Japan' }) }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('not specifically assessed');
    }
  });

  it('uses low confidence when no geocode available', () => {
    const result = scorePlanning(makeInputs({ geocode: null }), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confidence).toBe('low');
    }
  });

  it('uses medium confidence when geocode available', () => {
    const result = scorePlanning(makeInputs(), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confidence).toBe('medium');
    }
  });

  // --- Wind farm proximity ---

  it('boosts strongly when wind farm < 5km away', () => {
    const result = scorePlanning(makeInputs({ nearbyWindFarms: [{ distanceKm: 3.2 }] }), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('strong planning precedent');
      expect(result.value.score).toBeGreaterThanOrEqual(80);
    }
  });

  it('boosts moderately when wind farm 5-10km away', () => {
    const result = scorePlanning(makeInputs({ nearbyWindFarms: [{ distanceKm: 7.5 }] }), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('planning precedent exists');
    }
  });

  it('gives small boost when wind farm > 10km away', () => {
    const result = scorePlanning(makeInputs({ nearbyWindFarms: [{ distanceKm: 15 }] }), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('15.0km away');
    }
  });

  it('indicates no wind installations when none found', () => {
    const result = scorePlanning(makeInputs({ nearbyWindFarms: [] }), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('No existing wind installations');
    }
  });

  it('gives extra boost when 4+ wind installations nearby', () => {
    const farms: NearbyWindFarm[] = [
      { distanceKm: 3 },
      { distanceKm: 5 },
      { distanceKm: 8 },
      { distanceKm: 12 },
    ];
    const result = scorePlanning(makeInputs({ nearbyWindFarms: farms }), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('4 wind installations');
    }
  });

  // --- Residential density ---

  it('penalises high density areas (>20 tags)', () => {
    const result = scorePlanning(makeInputs({ residentialDensityProxy: 25 }), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('High density area');
    }
  });

  it('small penalty for moderate density (5-20 tags)', () => {
    const result = scorePlanning(makeInputs({ residentialDensityProxy: 10 }), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('Moderate density');
    }
  });

  it('favours low density areas (<5 tags)', () => {
    const result = scorePlanning(makeInputs({ residentialDensityProxy: 2 }), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('Low density area');
    }
  });

  // --- Score range ---

  it('best case: favourable country + close wind farm + low density', () => {
    const result = scorePlanning(
      makeInputs({
        geocode: makeGeocode({ countryCode: 'DK', country: 'Denmark' }),
        nearbyWindFarms: [
          { distanceKm: 2 },
          { distanceKm: 4 },
          { distanceKm: 6 },
          { distanceKm: 8 },
        ],
        residentialDensityProxy: 0,
      }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Base 50 + 10 (country) + 20 (close farm) + 5 (4+ farms) + 5 (low density) = 90
      expect(result.value.score).toBe(90);
    }
  });

  it('worst case: no geo, no farms, high density', () => {
    const result = scorePlanning(
      makeInputs({ geocode: null, nearbyWindFarms: [], residentialDensityProxy: 30 }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Base 50 + 0 (no country) + 0 (no farms) - 15 (high density) = 35
      expect(result.value.score).toBe(35);
    }
  });

  it('includes disclaimer about formal planning assessment', () => {
    const result = scorePlanning(makeInputs(), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('not a substitute for formal planning assessment');
    }
  });

  it('applies weight correctly to weightedScore', () => {
    const result = scorePlanning(makeInputs(), 0.15);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.weightedScore).toBeCloseTo(result.value.score * 0.15, 1);
    }
  });
});
