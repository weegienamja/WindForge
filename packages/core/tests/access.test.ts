import { describe, it, expect } from 'vitest';
import { scoreAccess } from '../src/scoring/access.js';
import type { RoadAccess } from '../src/datasources/osm-overpass.js';

function makeRoads(overrides: Partial<RoadAccess> = {}): RoadAccess {
  return {
    nearestMajorRoadDistanceKm: 1.5,
    nearestMajorRoadType: 'primary',
    nearestSecondaryRoadDistanceKm: 0.8,
    secondaryRoadCount: 3,
    bestRoadCategory: 'primary',
    searchRadiusKm: 5,
    ...overrides,
  };
}

describe('scoreAccess', () => {
  it('returns a valid FactorScore for accessLogistics', () => {
    const result = scoreAccess(makeRoads(), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factor).toBe('accessLogistics');
      expect(result.value.weight).toBe(0.1);
      expect(result.value.score).toBeGreaterThanOrEqual(0);
      expect(result.value.score).toBeLessThanOrEqual(100);
      expect(result.value.dataSource).toContain('Overpass');
    }
  });

  // --- Primary road within 2km ---

  it('scores 80-100 when primary road within 2km', () => {
    const result = scoreAccess(
      makeRoads({
        bestRoadCategory: 'primary',
        nearestMajorRoadDistanceKm: 1.0,
        nearestMajorRoadType: 'primary',
      }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBeGreaterThanOrEqual(80);
      expect(result.value.score).toBeLessThanOrEqual(100);
    }
  });

  it('scores 100 when primary road at 0 km', () => {
    const result = scoreAccess(
      makeRoads({ bestRoadCategory: 'primary', nearestMajorRoadDistanceKm: 0 }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(100);
    }
  });

  it('scores 80 when primary road at exactly 2km', () => {
    const result = scoreAccess(
      makeRoads({ bestRoadCategory: 'primary', nearestMajorRoadDistanceKm: 2.0 }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(80);
    }
  });

  // --- Primary road 2-5km ---

  it('scores 60-80 when primary road 2-5km away', () => {
    const result = scoreAccess(
      makeRoads({ bestRoadCategory: 'primary', nearestMajorRoadDistanceKm: 3.5 }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBeGreaterThanOrEqual(60);
      expect(result.value.score).toBeLessThanOrEqual(80);
    }
  });

  // --- Secondary road ---

  it('scores 60-79 when best road is secondary', () => {
    const result = scoreAccess(
      makeRoads({
        bestRoadCategory: 'secondary',
        nearestMajorRoadDistanceKm: -1,
        nearestSecondaryRoadDistanceKm: 1.0,
        nearestMajorRoadType: '',
      }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBeGreaterThanOrEqual(60);
      expect(result.value.score).toBeLessThanOrEqual(79);
    }
  });

  it('scores ~79 when secondary road at 0 km', () => {
    const result = scoreAccess(
      makeRoads({
        bestRoadCategory: 'secondary',
        nearestSecondaryRoadDistanceKm: 0,
        nearestMajorRoadDistanceKm: -1,
      }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(79);
    }
  });

  // --- Minor roads only ---

  it('scores 45 when only minor roads found', () => {
    const result = scoreAccess(
      makeRoads({
        bestRoadCategory: 'minor',
        nearestMajorRoadDistanceKm: -1,
        nearestMajorRoadType: '',
        nearestSecondaryRoadDistanceKm: -1,
        secondaryRoadCount: 0,
      }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(45);
    }
  });

  // --- No roads ---

  it('scores 10 when no roads found', () => {
    const result = scoreAccess(
      makeRoads({
        bestRoadCategory: 'none',
        nearestMajorRoadDistanceKm: -1,
        nearestMajorRoadType: '',
        nearestSecondaryRoadDistanceKm: -1,
        secondaryRoadCount: 0,
      }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(10);
      expect(result.value.detail).toContain('construction access is indeterminate');
    }
  });

  // --- Confidence ---

  it('has high confidence when roads are found', () => {
    const result = scoreAccess(makeRoads(), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confidence).toBe('high');
    }
  });

  it('has medium confidence when no roads found', () => {
    const result = scoreAccess(makeRoads({ bestRoadCategory: 'none' }), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confidence).toBe('medium');
    }
  });

  // --- Detail ---

  it('includes road type and distance in detail', () => {
    const result = scoreAccess(
      makeRoads({ nearestMajorRoadType: 'trunk', nearestMajorRoadDistanceKm: 3.4 }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('trunk');
      expect(result.value.detail).toContain('3.4km');
    }
  });

  it('includes secondary road count in detail', () => {
    const result = scoreAccess(makeRoads({ secondaryRoadCount: 7 }), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('7 secondary roads');
    }
  });

  it('includes no major roads message when none found', () => {
    const result = scoreAccess(
      makeRoads({ nearestMajorRoadDistanceKm: -1, nearestMajorRoadType: '' }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('No major roads found');
    }
  });

  // --- Weight ---

  it('applies weight correctly to weightedScore', () => {
    const result = scoreAccess(makeRoads(), 0.2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.weightedScore).toBeCloseTo(result.value.score * 0.2, 1);
    }
  });

  it('handles zero weight', () => {
    const result = scoreAccess(makeRoads(), 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.weight).toBe(0);
      expect(result.value.weightedScore).toBe(0);
    }
  });
});
