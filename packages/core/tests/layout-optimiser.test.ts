import { describe, it, expect } from 'vitest';
import { optimiseLayout } from '../src/energy/layout-optimiser.js';
import type { TurbineModel, TurbineLayoutEstimate } from '../src/types/turbines.js';
import type { SiteBoundary } from '../src/types/site.js';
import type { ExclusionZone } from '../src/types/constraints.js';
import type { WindDataSummary } from '../src/types/datasources.js';
import type { LatLng } from '../src/types/analysis.js';
import { distanceKm } from '../src/utils/geo.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeTurbine(overrides?: Partial<TurbineModel>): TurbineModel {
  return {
    id: 'test-turbine',
    manufacturer: 'Test',
    model: 'T-3000',
    ratedPowerKw: 3000,
    rotorDiameterM: 100,
    hubHeightOptionsM: [80],
    cutInSpeedMs: 3,
    ratedSpeedMs: 12,
    cutOutSpeedMs: 25,
    powerCurve: [
      { windSpeedMs: 0, powerKw: 0 },
      { windSpeedMs: 3, powerKw: 0 },
      { windSpeedMs: 5, powerKw: 200 },
      { windSpeedMs: 8, powerKw: 900 },
      { windSpeedMs: 10, powerKw: 1800 },
      { windSpeedMs: 12, powerKw: 3000 },
      { windSpeedMs: 15, powerKw: 3000 },
      { windSpeedMs: 25, powerKw: 3000 },
      { windSpeedMs: 25.1, powerKw: 0 },
    ],
    thrustCurve: [
      { windSpeedMs: 3, thrustCoefficient: 0.9 },
      { windSpeedMs: 5, thrustCoefficient: 0.85 },
      { windSpeedMs: 8, thrustCoefficient: 0.8 },
      { windSpeedMs: 10, thrustCoefficient: 0.7 },
      { windSpeedMs: 12, thrustCoefficient: 0.5 },
      { windSpeedMs: 15, thrustCoefficient: 0.3 },
      { windSpeedMs: 25, thrustCoefficient: 0.1 },
    ],
    ...overrides,
  };
}

// ~5km square boundary
function makeBoundary(): SiteBoundary {
  const south = 55.8;
  const north = 55.85;
  const west = -4.3;
  const east = -4.22;
  return {
    id: 'test-site',
    name: 'Test Site',
    polygon: [
      { lat: south, lng: west },
      { lat: north, lng: west },
      { lat: north, lng: east },
      { lat: south, lng: east },
    ],
    areaSqKm: 25,
    centroid: { lat: (south + north) / 2, lng: (west + east) / 2 },
    boundingBox: { north, south, east, west },
  };
}

function makeWindData(): WindDataSummary {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    months.push({
      year: 2023,
      month: m,
      averageSpeedMs: 7 + Math.sin((m / 12) * Math.PI * 2),
      averageDirectionDeg: 270,
      maxGustMs: 20,
      prevailingDirection: 'W' as const,
      dataCompleteness: 1,
    });
  }
  return {
    coordinate: { lat: 55.825, lng: -4.26 },
    annualAverageSpeedMs: 7,
    annualAverageDirectionDeg: 270,
    prevailingDirectionDeg: 270,
    monthlyAverages: months,
    dataYears: 10,
    measurementHeightM: 50,
  };
}

function makeLayout(positions: LatLng[]): TurbineLayoutEstimate {
  return {
    positions,
    turbineCount: positions.length,
    spacingCrosswindM: 400,
    spacingDownwindM: 700,
    prevailingWindDeg: 270,
    viableAreaSqKm: 25,
    estimatedInstalledCapacityMw: (positions.length * 3000) / 1000,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Layout Optimiser', () => {
  const turbine = makeTurbine();
  const boundary = makeBoundary();
  const windData = makeWindData();

  it('returns valid result structure', () => {
    const layout = makeLayout([
      { lat: 55.82, lng: -4.27 },
      { lat: 55.83, lng: -4.27 },
    ]);

    const result = optimiseLayout(layout, boundary, turbine, windData);

    expect(result.optimisedPositions).toHaveLength(2);
    expect(result.initialAepMwh).toBeGreaterThan(0);
    expect(result.optimisedAepMwh).toBeGreaterThanOrEqual(result.initialAepMwh);
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.convergenceHistory.length).toBeGreaterThanOrEqual(2);
    expect(result.convergenceHistory[0]!.iteration).toBe(0);
  });

  it('does not worsen AEP', () => {
    const layout = makeLayout([
      { lat: 55.82, lng: -4.27 },
      { lat: 55.83, lng: -4.27 },
    ]);

    const result = optimiseLayout(layout, boundary, turbine, windData, [], {
      maxIterations: 5,
      wakeModel: 'jensen',
    });

    expect(result.optimisedAepMwh).toBeGreaterThanOrEqual(result.initialAepMwh);
    expect(result.improvementPercent).toBeGreaterThanOrEqual(0);
  });

  it('improves inline layout by shifting turbines apart', () => {
    // Two turbines directly aligned with prevailing wind (west), close together
    // The optimiser should shift them to reduce wake interference
    const layout = makeLayout([
      { lat: 55.825, lng: -4.27 },
      { lat: 55.825, lng: -4.265 }, // ~350m east, directly downwind
    ]);

    const result = optimiseLayout(layout, boundary, turbine, windData, [], {
      maxIterations: 20,
      initialStepM: 50,
      minStepM: 10,
      wakeModel: 'jensen',
    });

    // At least one turbine should have moved (lat should differ now)
    const latDiff = Math.abs(result.optimisedPositions[0]!.lat - result.optimisedPositions[1]!.lat);
    // The optimiser should have offset them crosswind
    expect(latDiff).toBeGreaterThan(0);
  });

  it('keeps all positions inside boundary', () => {
    const layout = makeLayout([
      { lat: 55.82, lng: -4.27 },
      { lat: 55.83, lng: -4.25 },
    ]);

    const result = optimiseLayout(layout, boundary, turbine, windData, [], {
      maxIterations: 10,
    });

    const b = boundary;
    for (const pos of result.optimisedPositions) {
      expect(pos.lat).toBeGreaterThanOrEqual(b.boundingBox.south);
      expect(pos.lat).toBeLessThanOrEqual(b.boundingBox.north);
      expect(pos.lng).toBeGreaterThanOrEqual(b.boundingBox.west);
      expect(pos.lng).toBeLessThanOrEqual(b.boundingBox.east);
    }
  });

  it('avoids exclusion zones', () => {
    // Place an exclusion zone at a potential move target
    const exclusionZone: ExclusionZone = {
      reason: 'Protected area',
      polygon: [
        { lat: 55.824, lng: -4.272 },
        { lat: 55.826, lng: -4.272 },
        { lat: 55.826, lng: -4.268 },
        { lat: 55.824, lng: -4.268 },
      ],
      areaSqKm: 0.05,
    };

    const layout = makeLayout([
      { lat: 55.823, lng: -4.27 },
      { lat: 55.827, lng: -4.27 },
    ]);

    const result = optimiseLayout(layout, boundary, turbine, windData, [exclusionZone], {
      maxIterations: 10,
    });

    // No position should be inside the exclusion zone
    for (const pos of result.optimisedPositions) {
      const inExclusion =
        pos.lat >= 55.824 && pos.lat <= 55.826 && pos.lng >= -4.272 && pos.lng <= -4.268;
      expect(inExclusion).toBe(false);
    }
  });

  it('maintains minimum spacing between turbines', () => {
    const layout = makeLayout([
      { lat: 55.82, lng: -4.27 },
      { lat: 55.83, lng: -4.27 },
      { lat: 55.82, lng: -4.25 },
    ]);

    const minSpacingDiameters = 3;
    const result = optimiseLayout(layout, boundary, turbine, windData, [], {
      maxIterations: 10,
      minSpacingDiameters,
    });

    const minSpacingKm = (minSpacingDiameters * turbine.rotorDiameterM) / 1000;
    const n = result.optimisedPositions.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = distanceKm(result.optimisedPositions[i]!, result.optimisedPositions[j]!);
        expect(d).toBeGreaterThanOrEqual(minSpacingKm * 0.99); // small tolerance for floating point
      }
    }
  });

  it('converges and stops within max iterations', () => {
    const layout = makeLayout([
      { lat: 55.82, lng: -4.27 },
      { lat: 55.83, lng: -4.25 },
    ]);

    const result = optimiseLayout(layout, boundary, turbine, windData, [], {
      maxIterations: 5,
    });

    expect(result.iterations).toBeLessThanOrEqual(5);
  });

  it('handles single turbine layout (no wake interaction)', () => {
    const layout = makeLayout([{ lat: 55.825, lng: -4.26 }]);

    const result = optimiseLayout(layout, boundary, turbine, windData, [], {
      maxIterations: 3,
    });

    expect(result.optimisedPositions).toHaveLength(1);
    expect(result.initialAepMwh).toBeGreaterThan(0);
    // Single turbine has no wake, so improvement should be 0 or very small
    expect(result.improvementPercent).toBeLessThanOrEqual(0.01);
  });

  it('respects bastankhah wake model option', () => {
    const layout = makeLayout([
      { lat: 55.82, lng: -4.27 },
      { lat: 55.83, lng: -4.27 },
    ]);

    const resultJensen = optimiseLayout(layout, boundary, turbine, windData, [], {
      maxIterations: 3,
      wakeModel: 'jensen',
    });
    const resultBastankhah = optimiseLayout(layout, boundary, turbine, windData, [], {
      maxIterations: 3,
      wakeModel: 'bastankhah',
    });

    // Both should produce valid results (AEP may differ due to model differences)
    expect(resultJensen.initialAepMwh).toBeGreaterThan(0);
    expect(resultBastankhah.initialAepMwh).toBeGreaterThan(0);
  });

  it('convergence history is monotonically non-decreasing', () => {
    const layout = makeLayout([
      { lat: 55.82, lng: -4.27 },
      { lat: 55.825, lng: -4.265 },
      { lat: 55.83, lng: -4.27 },
    ]);

    const result = optimiseLayout(layout, boundary, turbine, windData, [], {
      maxIterations: 10,
    });

    for (let i = 1; i < result.convergenceHistory.length; i++) {
      expect(result.convergenceHistory[i]!.aepMwh).toBeGreaterThanOrEqual(
        result.convergenceHistory[i - 1]!.aepMwh,
      );
    }
  });

  it('step size reduction leads to convergence', () => {
    const layout = makeLayout([
      { lat: 55.82, lng: -4.27 },
      { lat: 55.83, lng: -4.27 },
    ]);

    // Large initial step but small min - should converge rapidly
    const result = optimiseLayout(layout, boundary, turbine, windData, [], {
      maxIterations: 30,
      initialStepM: 200,
      minStepM: 50,
    });

    // Should stop before hitting max iterations due to step size shrinking below min
    expect(result.iterations).toBeLessThanOrEqual(30);
    expect(result.optimisedAepMwh).toBeGreaterThanOrEqual(result.initialAepMwh);
  });

  it('handles custom roughness class', () => {
    const layout = makeLayout([
      { lat: 55.82, lng: -4.27 },
      { lat: 55.83, lng: -4.27 },
    ]);

    const result = optimiseLayout(layout, boundary, turbine, windData, [], {
      maxIterations: 3,
      roughnessClass: 2,
    });

    expect(result.initialAepMwh).toBeGreaterThan(0);
    expect(result.optimisedPositions).toHaveLength(2);
  });
});
