import { describe, expect, it } from 'vitest';
import { findCandidateLayouts } from '../src/energy/candidate-layout-search.js';
import type { LatLng } from '../src/types/analysis.js';
import type { ExclusionZone } from '../src/types/constraints.js';
import { distanceKm } from '../src/utils/geo.js';
import { boundary, candidateGrid } from './fixtures/layout-search.js';

// Independent brute-force oracle over every subset, without graph pruning.
function exhaustiveCount(points: LatLng[], count: number, minSpacingM: number): number {
  let valid = 0;
  for (let mask = 0; mask < 2 ** points.length; mask++) {
    const selected = points.filter((_, index) => mask & (1 << index));
    if (selected.length !== count) continue;
    if (
      selected.every((a, i) =>
        selected.slice(i + 1).every((b) => distanceKm(a, b) * 1000 >= minSpacingM),
      )
    )
      valid++;
  }
  return valid;
}

describe('candidate layout search', () => {
  it.each([
    0, 1, 2, 4, 6, 12,
  ])('matches exhaustive fixed-count enumeration for %i turbines', (count) => {
    const points = candidateGrid(12);
    for (const spacing of [200, 400, 700]) {
      const result = findCandidateLayouts(points, boundary, count, spacing, [], {
        maxSearchNodes: 100_000,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.countIsExact).toBe(true);
      expect(result.value.feasibleLayoutCount).toBe(exhaustiveCount(points, count, spacing));
      for (const layout of result.value.layouts) {
        expect(layout).toHaveLength(count);
        expect(exhaustiveCount(layout, count, spacing)).toBe(1);
      }
    }
  });

  it('filters exclusions and off-site points, deduplicates and preserves holes', () => {
    const zone: ExclusionZone = {
      reason: 'Synthetic exclusion',
      areaSqKm: 1,
      polygon: [
        { lat: 55.81, lng: -4.29 },
        { lat: 55.84, lng: -4.29 },
        { lat: 55.84, lng: -4.23 },
        { lat: 55.81, lng: -4.23 },
      ],
      holes: [
        [
          { lat: 55.82, lng: -4.27 },
          { lat: 55.83, lng: -4.27 },
          { lat: 55.83, lng: -4.25 },
          { lat: 55.82, lng: -4.25 },
        ],
      ],
    };
    const hole = { lat: 55.825, lng: -4.26 };
    const points = [hole, { ...hole }, { lat: 55.815, lng: -4.28 }, { lat: 56, lng: -4.26 }];
    const result = findCandidateLayouts(points, boundary, 1, 300, [zone]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      candidateCount: 1,
      excludedCandidateCount: 2,
      duplicateCandidateCount: 1,
      feasibleLayoutCount: 1,
      countIsExact: true,
    });
    expect(result.value.layouts).toEqual([[hole]]);
  });

  it('reports a lower bound and obeys the node budget without claiming infeasibility', () => {
    const points = candidateGrid(128);
    const result = findCandidateLayouts(points, boundary, 8, 200, [], {
      maxSearchNodes: 50,
      maxLayouts: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      status: 'search-limit',
      countIsExact: false,
      searchNodes: 50,
    });
    expect(result.value.layouts.length).toBeLessThanOrEqual(3);
    expect(result.value.feasibleLayoutCount).toBeGreaterThan(0);
    const empty = findCandidateLayouts(points, boundary, 8, 200, [], { maxSearchNodes: 1 });
    expect(empty.ok && empty.value).toMatchObject({ feasibleLayoutCount: 0, countIsExact: false });
  });

  it('is reproducible and does not mutate or alias the inputs', () => {
    const points = candidateGrid(12);
    const original = structuredClone(points);
    const options = { seed: 42, maxLayouts: 3 };
    const a = findCandidateLayouts(points, boundary, 3, 300, [], options);
    const b = findCandidateLayouts(points, boundary, 3, 300, [], options);
    expect(a).toEqual(b);
    if (a.ok) a.value.layouts[0]![0]!.lat = 0;
    expect(points).toEqual(original);
  });

  it('distinguishes proven infeasibility and the one empty layout', () => {
    const impossible = findCandidateLayouts(candidateGrid(3), boundary, 4, 300);
    expect(impossible.ok && impossible.value).toMatchObject({
      feasibleLayoutCount: 0,
      countIsExact: true,
      layouts: [],
    });
    const empty = findCandidateLayouts([], boundary, 0, 300);
    expect(empty.ok && empty.value).toMatchObject({
      feasibleLayoutCount: 1,
      countIsExact: true,
      layouts: [[]],
    });
  });

  it('rejects invalid coordinates and work limits before searching', () => {
    expect(findCandidateLayouts(candidateGrid(129), boundary, 2, 300).ok).toBe(false);
    expect(findCandidateLayouts([{ lat: NaN, lng: 0 }], boundary, 1, 300).ok).toBe(false);
    expect(findCandidateLayouts([], { ...boundary, polygon: [] }, 0, 300).ok).toBe(false);
    const point = { lat: 55.825, lng: -4.26 };
    const degenerateZone = {
      reason: 'Repeated vertex',
      areaSqKm: 0,
      polygon: [point, point, point],
    };
    expect(findCandidateLayouts([point], boundary, 1, 300, [degenerateZone]).ok).toBe(false);
    for (const spacing of [0, -1, NaN, Infinity])
      expect(findCandidateLayouts([], boundary, 0, spacing).ok).toBe(false);
    for (const maxSearchNodes of [0, 1.5, Infinity, 1_000_001])
      expect(findCandidateLayouts([], boundary, 0, 300, [], { maxSearchNodes }).ok).toBe(false);
    expect(findCandidateLayouts([], boundary, 0, 300, [], { maxLayouts: 17 }).ok).toBe(false);
    expect(findCandidateLayouts([], boundary, 0, 300, [], { seed: -1 }).ok).toBe(false);
  });
});
