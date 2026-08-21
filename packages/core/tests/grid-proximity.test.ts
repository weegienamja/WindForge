import { describe, it, expect } from 'vitest';
import { scoreGridProximity } from '../src/scoring/grid-proximity.js';
import type { GridInfrastructure } from '../src/datasources/osm-overpass.js';

function makeGrid(overrides: Partial<GridInfrastructure> = {}): GridInfrastructure {
  return {
    nearestLineDistanceKm: 10,
    nearestSubstationDistanceKm: 15,
    lineCount: 3,
    substationCount: 1,
    searchRadiusKm: 50,
    ...overrides,
  };
}

describe('scoreGridProximity', () => {
  it('returns a valid FactorScore for gridProximity factor', () => {
    const result = scoreGridProximity(makeGrid(), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factor).toBe('gridProximity');
      expect(result.value.weight).toBe(0.1);
      expect(result.value.score).toBeGreaterThanOrEqual(0);
      expect(result.value.score).toBeLessThanOrEqual(100);
      expect(result.value.dataSource).toContain('Overpass');
    }
  });

  it('scores very close infrastructure highly (< 5km)', () => {
    const result = scoreGridProximity(
      makeGrid({ nearestLineDistanceKm: 1, nearestSubstationDistanceKm: 2 }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBeGreaterThanOrEqual(90);
    }
  });

  it('scores infrastructure at 5-15km as good (70-89)', () => {
    const result = scoreGridProximity(
      makeGrid({ nearestLineDistanceKm: 10, nearestSubstationDistanceKm: 10 }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBeGreaterThanOrEqual(70);
      expect(result.value.score).toBeLessThanOrEqual(89);
    }
  });

  it('scores infrastructure at 15-30km as moderate (40-69)', () => {
    const result = scoreGridProximity(
      makeGrid({ nearestLineDistanceKm: 25, nearestSubstationDistanceKm: 25 }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBeGreaterThanOrEqual(40);
      expect(result.value.score).toBeLessThanOrEqual(69);
    }
  });

  it('scores infrastructure at 30-50km as poor (20-39)', () => {
    const result = scoreGridProximity(
      makeGrid({ nearestLineDistanceKm: 40, nearestSubstationDistanceKm: 40 }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBeGreaterThanOrEqual(20);
      expect(result.value.score).toBeLessThanOrEqual(39);
    }
  });

  it('scores infrastructure beyond 50km very poorly', () => {
    const result = scoreGridProximity(
      makeGrid({ nearestLineDistanceKm: 80, nearestSubstationDistanceKm: 90 }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBeLessThan(20);
    }
  });

  it('handles no infrastructure found (sentinel -1)', () => {
    const result = scoreGridProximity(
      makeGrid({
        nearestLineDistanceKm: -1,
        nearestSubstationDistanceKm: -1,
        lineCount: 0,
        substationCount: 0,
      }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(0);
      expect(result.value.detail).toContain('No transmission lines found');
      expect(result.value.detail).toContain('No substations found');
    }
  });

  it('handles only lines, no substations', () => {
    const result = scoreGridProximity(
      makeGrid({ nearestLineDistanceKm: 5, nearestSubstationDistanceKm: -1, substationCount: 0 }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only line score contributes (40% weight) → ~90*0.4 = 36
      expect(result.value.score).toBeGreaterThan(30);
      expect(result.value.score).toBeLessThan(50);
    }
  });

  it('handles only substations, no lines', () => {
    const result = scoreGridProximity(
      makeGrid({ nearestLineDistanceKm: -1, nearestSubstationDistanceKm: 3, lineCount: 0 }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only substation score contributes (60% weight) → ~96*0.6 = 58
      expect(result.value.score).toBeGreaterThan(50);
      expect(result.value.score).toBeLessThan(65);
    }
  });

  it('weights substations higher than lines (60/40 split)', () => {
    const closeSubstation = scoreGridProximity(
      makeGrid({ nearestLineDistanceKm: 50, nearestSubstationDistanceKm: 1 }),
      0.1,
    );
    const closeLine = scoreGridProximity(
      makeGrid({ nearestLineDistanceKm: 1, nearestSubstationDistanceKm: 50 }),
      0.1,
    );
    expect(closeSubstation.ok && closeLine.ok).toBe(true);
    if (closeSubstation.ok && closeLine.ok) {
      // Close substation should score higher due to 60% weight vs 40%
      expect(closeSubstation.value.score).toBeGreaterThan(closeLine.value.score);
    }
  });

  it('applies weight correctly to weightedScore', () => {
    const result = scoreGridProximity(makeGrid(), 0.15);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.weightedScore).toBeCloseTo(result.value.score * 0.15, 1);
    }
  });

  it('has high confidence when infrastructure found within 50km', () => {
    const result = scoreGridProximity(makeGrid(), 0.1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confidence).toBe('high');
    }
  });

  it('has medium confidence when expanded search radius used', () => {
    const result = scoreGridProximity(
      makeGrid({
        searchRadiusKm: 100,
        lineCount: 0,
        substationCount: 0,
        nearestLineDistanceKm: -1,
        nearestSubstationDistanceKm: -1,
      }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confidence).toBe('medium');
    }
  });

  it('includes distance details in description', () => {
    const result = scoreGridProximity(
      makeGrid({
        nearestLineDistanceKm: 7.3,
        nearestSubstationDistanceKm: 12.8,
        lineCount: 5,
        substationCount: 2,
      }),
      0.1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('7.3km');
      expect(result.value.detail).toContain('12.8km');
      expect(result.value.detail).toContain('5 lines');
      expect(result.value.detail).toContain('2 substations');
    }
  });

  it('handles zero-weight correctly', () => {
    const result = scoreGridProximity(makeGrid(), 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.weight).toBe(0);
      expect(result.value.weightedScore).toBe(0);
    }
  });
});
