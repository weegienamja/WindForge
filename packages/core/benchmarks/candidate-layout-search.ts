import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import type { LatLng } from '../src/types/analysis.js';
import type { ExclusionZone } from '../src/types/constraints.js';
import { optimiseLayout } from '../src/energy/layout-optimiser.js';
import { optimiseLayoutWithCandidates } from '../src/energy/multi-start-layout-optimiser.js';
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
} from '../tests/fixtures/layout-search.js';

const bands: ExclusionZone[] = [
  {
    reason: 'Synthetic excluded band separating two usable areas',
    areaSqKm: 15,
    polygon: [
      { lat: 55.80045, lng: -4.3 },
      { lat: 55.83, lng: -4.3 },
      { lat: 55.83, lng: -4.22 },
      { lat: 55.80045, lng: -4.22 },
    ],
  },
];
const cases = [
  {
    name: 'open-12',
    candidates: candidateGrid(12),
    initial: makeLayout(candidateGrid(12).slice(0, 3)),
    zones: [],
  },
  {
    name: 'open-64',
    candidates: candidateGrid(64),
    initial: makeLayout(candidateGrid(64).slice(0, 4)),
    zones: [],
  },
  {
    name: 'open-128',
    candidates: candidateGrid(128),
    initial: makeLayout(candidateGrid(128).slice(0, 4)),
    zones: [],
  },
  {
    name: 'separated-areas',
    candidates: [
      ...inlineLayout.positions.map((p) => ({ ...p, lat: 55.8002 })),
      { lat: 55.835, lng: -4.27 },
      { lat: 55.84, lng: -4.27 },
      { lat: 55.845, lng: -4.25 },
      { lat: 55.835, lng: -4.24 },
    ],
    initial: makeLayout(inlineLayout.positions.map((p) => ({ ...p, lat: 55.8002 }))),
    zones: bands,
  },
];

function violations(positions: LatLng[], zones: ExclusionZone[]): number {
  let count = positions.filter(
    (p) =>
      !isPointInPolygon(p, boundary.polygon) ||
      zones.some((zone) => pointInPolygonWithHoles(p, zone.polygon, zone.holes)),
  ).length;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (distanceKm(positions[i]!, positions[j]!) < 0.3) count++;
    }
  }
  return count;
}

// Warm up both implementations; times below are illustrative, not CI thresholds.
optimiseLayoutWithCandidates(inlineLayout, boundary, turbine, windData, [], {
  maxIterations: 1,
  maxSearchNodes: 100,
});
const results = [];
for (const scenario of cases) {
  for (const wakeModel of ['jensen', 'bastankhah'] as const) {
    const options = {
      wakeModel,
      maxIterations: 20,
      initialStepM: 100,
      minStepM: 10,
      maxSearchNodes: 20_000,
      maxLayouts: 8,
      seed: 42,
      candidatePositions: scenario.candidates,
    };
    const baselineStart = performance.now();
    const baseline = optimiseLayout(
      scenario.initial,
      boundary,
      turbine,
      windData,
      scenario.zones,
      options,
    );
    const baselineMs = performance.now() - baselineStart;
    const heapBefore = process.memoryUsage().heapUsed;
    const start = performance.now();
    const result = optimiseLayoutWithCandidates(
      scenario.initial,
      boundary,
      turbine,
      windData,
      scenario.zones,
      options,
    );
    const multiStartMs = performance.now() - start;
    const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
    assert(result.ok, result.ok ? '' : result.error.message);
    const value = result.value;
    assert.deepEqual(value.baseline, baseline);
    assert(value.best.optimisedAepMwh >= baseline.optimisedAepMwh);
    assert.equal(value.best.optimisedPositions.length, scenario.initial.turbineCount);
    assert.equal(violations(value.best.optimisedPositions, scenario.zones), 0);
    results.push({
      case: scenario.name,
      wakeModel,
      candidates: value.search.candidateCount,
      turbines: scenario.initial.turbineCount,
      baselineAepMwh: baseline.optimisedAepMwh,
      bestAepMwh: value.best.optimisedAepMwh,
      gainPercent: Number(value.improvementOverBaselinePercent.toFixed(3)),
      baselineMs: Number(baselineMs.toFixed(2)),
      multiStartMs: Number(multiStartMs.toFixed(2)),
      // Net heap change is affected by garbage collection; it is NOT peak memory.
      heapDeltaBytes,
      searchNodes: value.search.searchNodes,
      feasibleLayoutCount: value.search.feasibleLayoutCount,
      countIsExact: value.search.countIsExact,
      startsEvaluated: value.startsEvaluated,
      constraintViolations: 0,
    });
  }
}
console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      note: 'Synthetic screening cases. Timing is one measured run after warm-up; net heap delta is not peak memory. No real-site validation or global optimality claim.',
      results,
    },
    null,
    2,
  ),
);
