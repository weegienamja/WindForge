import { describe, expect, it } from 'vitest';
import { optimiseLayout } from '../src/energy/layout-optimiser.js';
import { optimiseLayoutWithCandidates } from '../src/energy/multi-start-layout-optimiser.js';
import type { ExclusionZone } from '../src/types/constraints.js';
import { pointInPolygonWithHoles } from '../src/utils/feature-geometry.js';
import { distanceKm } from '../src/utils/geo.js';
import { isPointInPolygon } from '../src/utils/geometry.js';
import {
  boundary,
  candidateGrid,
  inlineLayout,
  makeLayout,
  turbine,
  windData,
} from './fixtures/layout-search.js';

describe('multi-start layout optimiser', () => {
  it.each([
    'jensen',
    'bastankhah',
  ] as const)('beats a trapped start using the same %s model and refinement budget', (wakeModel) => {
    const options = {
      wakeModel,
      maxIterations: 2,
      initialStepM: 1,
      minStepM: 1,
      roughnessClass: 2,
      candidatePositions: [...inlineLayout.positions, { lat: 55.835, lng: -4.27 }],
      maxLayouts: 3,
    };
    const result = optimiseLayoutWithCandidates(
      inlineLayout,
      boundary,
      turbine,
      windData,
      [],
      options,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.baseline).toEqual(
      optimiseLayout(inlineLayout, boundary, turbine, windData, [], options),
    );
    expect(result.value.best.optimisedAepMwh).toBeGreaterThan(
      result.value.baseline.optimisedAepMwh,
    );
    expect(result.value.selectedStart).toBe('candidate');
    expect(result.value.startsEvaluated).toBe(3);
    expect(result.value.search.feasibleLayoutCount).toBe(3);
    const positions = result.value.best.optimisedPositions;
    expect(positions).toHaveLength(inlineLayout.turbineCount);
    expect(positions.every((p) => isPointInPolygon(p, boundary.polygon))).toBe(true);
    expect(distanceKm(positions[0]!, positions[1]!)).toBeGreaterThanOrEqual(0.3);
  });

  it('keeps the baseline when candidate search has no solution or runs out of work', () => {
    for (const options of [
      { candidatePositions: [], maxIterations: 2 },
      { candidatePositions: candidateGrid(64), maxSearchNodes: 1, maxIterations: 2 },
    ]) {
      const result = optimiseLayoutWithCandidates(
        inlineLayout,
        boundary,
        turbine,
        windData,
        [],
        options,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.best).toEqual(result.value.baseline);
      expect(result.value.selectedStart).toBe('baseline');
      expect(result.value.startsEvaluated).toBe(1);
    }
  });

  it('preserves exclusions during refinement and rejects an excluded baseline', () => {
    const zone: ExclusionZone = {
      reason: 'Synthetic exclusion north of the baseline',
      areaSqKm: 1,
      polygon: [
        { lat: 55.826, lng: -4.29 },
        { lat: 55.84, lng: -4.29 },
        { lat: 55.84, lng: -4.23 },
        { lat: 55.826, lng: -4.23 },
      ],
    };
    const result = optimiseLayoutWithCandidates(inlineLayout, boundary, turbine, windData, [zone], {
      candidatePositions: candidateGrid(64),
      maxIterations: 20,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const p of result.value.best.optimisedPositions) {
      expect(pointInPolygonWithHoles(p, zone.polygon)).toBe(false);
    }
    const excluded = makeLayout([{ lat: 55.83, lng: -4.27 }]);
    expect(optimiseLayoutWithCandidates(excluded, boundary, turbine, windData, [zone]).ok).toBe(
      false,
    );
  });

  it('builds a bounded default pool and preserves the input', () => {
    const snapshot = structuredClone({ inlineLayout, boundary, turbine, windData });
    const result = optimiseLayoutWithCandidates(inlineLayout, boundary, turbine, windData, [], {
      maxIterations: 2,
      maxLayouts: 2,
      maxSearchNodes: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.search.inputCandidateCount).toBe(64);
    expect(result.value.startsEvaluated).toBeLessThanOrEqual(3);
    expect(result.value.best.optimisedAepMwh).toBeGreaterThanOrEqual(
      result.value.baseline.optimisedAepMwh,
    );
    expect({ inlineLayout, boundary, turbine, windData }).toEqual(snapshot);
  });

  it('does not score an infeasible or inconsistent baseline', () => {
    const outside = makeLayout([{ lat: 56, lng: -4.26 }]);
    const crowded = makeLayout([inlineLayout.positions[0]!, inlineLayout.positions[0]!]);
    for (const layout of [outside, crowded, { ...inlineLayout, turbineCount: 3 }]) {
      expect(optimiseLayoutWithCandidates(layout, boundary, turbine, windData).ok).toBe(false);
    }
    expect(
      optimiseLayoutWithCandidates(inlineLayout, boundary, turbine, windData, [], {
        maxIterations: Infinity,
      }).ok,
    ).toBe(false);
  });

  it('handles zero turbines and skips duplicate baseline starts', () => {
    const empty = optimiseLayoutWithCandidates(makeLayout([]), boundary, turbine, windData, [], {
      maxIterations: 0,
    });
    expect(empty.ok && empty.value).toMatchObject({
      startsEvaluated: 1,
      selectedStart: 'baseline',
      improvementOverBaselinePercent: 0,
    });
    const same = optimiseLayoutWithCandidates(inlineLayout, boundary, turbine, windData, [], {
      candidatePositions: inlineLayout.positions,
      maxIterations: 0,
    });
    expect(same.ok && same.value.startsEvaluated).toBe(1);
  });
});
