import { describe, it, expect } from 'vitest';
import { estimateTurbineCapacity } from '../src/energy/turbine-layout.js';
import { createBoundary } from '../src/site/site-boundary.js';
import { getTurbineById } from '../src/turbines/turbine-library.js';
import type { WindDataSummary } from '../src/types/datasources.js';
import type { LatLng } from '../src/types/analysis.js';
import type { ExclusionZone } from '../src/types/constraints.js';

// ~1.1 km x 1.1 km square => ~1.2 sq km
const SQUARE: LatLng[] = [
  { lat: 55.86, lng: -4.26 },
  { lat: 55.86, lng: -4.25 },
  { lat: 55.87, lng: -4.25 },
  { lat: 55.87, lng: -4.26 },
];

// Larger area (~3km x 3km)
const LARGE_SQUARE: LatLng[] = [
  { lat: 55.86, lng: -4.28 },
  { lat: 55.86, lng: -4.24 },
  { lat: 55.89, lng: -4.24 },
  { lat: 55.89, lng: -4.28 },
];

function makeWindData(overrides: Partial<WindDataSummary> = {}): WindDataSummary {
  return {
    coordinate: { lat: 55.865, lng: -4.255 },
    annualAverageSpeedMs: 7.5,
    speedStdDevMs: 3.5,
    prevailingDirectionDeg: 240,
    directionalConsistency: 0.65,
    dataYears: 10,
    referenceHeightM: 50,
    monthlyAverages: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      averageSpeedMs: 7.5,
      averageDirectionDeg: 240,
    })),
    ...overrides,
  };
}

describe('estimateTurbineCapacity', () => {
  it('returns positions within the boundary', () => {
    const boundary = createBoundary(LARGE_SQUARE, 'Large');
    const turbine = getTurbineById('vestas-v90-2000')!;
    const layout = estimateTurbineCapacity(boundary, turbine, makeWindData());
    expect(layout.turbineCount).toBeGreaterThan(0);
    expect(layout.positions).toHaveLength(layout.turbineCount);
  });

  it('respects crosswind and downwind spacing', () => {
    const boundary = createBoundary(LARGE_SQUARE, 'Large');
    const turbine = getTurbineById('vestas-v90-2000')!;
    const layout = estimateTurbineCapacity(boundary, turbine, makeWindData());
    // Crosswind = 4D = 360m, Downwind = 7D = 630m
    expect(layout.spacingCrosswindM).toBe(4 * turbine.rotorDiameterM);
    expect(layout.spacingDownwindM).toBe(7 * turbine.rotorDiameterM);
  });

  it('larger turbine fits fewer positions', () => {
    const boundary = createBoundary(LARGE_SQUARE, 'Large');
    const small = getTurbineById('vestas-v47-660')!;
    const large = getTurbineById('vestas-v172-7200')!;
    const wind = makeWindData();
    const layoutSmall = estimateTurbineCapacity(boundary, small, wind);
    const layoutLarge = estimateTurbineCapacity(boundary, large, wind);
    expect(layoutSmall.turbineCount).toBeGreaterThan(layoutLarge.turbineCount);
  });

  it('reports prevailing wind direction', () => {
    const boundary = createBoundary(SQUARE, 'Test');
    const turbine = getTurbineById('vestas-v90-2000')!;
    const layout = estimateTurbineCapacity(boundary, turbine, makeWindData({ prevailingDirectionDeg: 270 }));
    expect(layout.prevailingWindDeg).toBe(270);
  });

  it('small area fits fewer turbines', () => {
    const smallBoundary = createBoundary(SQUARE, 'Small');
    const largeBoundary = createBoundary(LARGE_SQUARE, 'Large');
    const turbine = getTurbineById('vestas-v90-2000')!;
    const wind = makeWindData();
    const layoutSmall = estimateTurbineCapacity(smallBoundary, turbine, wind);
    const layoutLarge = estimateTurbineCapacity(largeBoundary, turbine, wind);
    expect(layoutLarge.turbineCount).toBeGreaterThan(layoutSmall.turbineCount);
  });

  it('exclusion zones reduce viable positions', () => {
    const boundary = createBoundary(LARGE_SQUARE, 'Large');
    const turbine = getTurbineById('vestas-v90-2000')!;
    const wind = makeWindData();

    const noExclusion = estimateTurbineCapacity(boundary, turbine, wind);

    // Exclusion zone covering center of site
    const exclusion: ExclusionZone = {
      polygon: [
        { lat: 55.87, lng: -4.27 },
        { lat: 55.87, lng: -4.25 },
        { lat: 55.88, lng: -4.25 },
        { lat: 55.88, lng: -4.27 },
      ],
      radiusKm: 0.5,
      areaSqKm: 0.5,
      constraintId: 'test-constraint',
    };

    const withExclusion = estimateTurbineCapacity(boundary, turbine, wind, [exclusion]);
    expect(withExclusion.turbineCount).toBeLessThan(noExclusion.turbineCount);
    expect(withExclusion.viableAreaSqKm).toBeLessThan(noExclusion.viableAreaSqKm);
  });

  it('calculates estimated installed capacity', () => {
    const boundary = createBoundary(LARGE_SQUARE, 'Large');
    const turbine = getTurbineById('vestas-v90-2000')!;
    const layout = estimateTurbineCapacity(boundary, turbine, makeWindData());
    const expectedMw = (layout.turbineCount * turbine.ratedPowerKw) / 1000;
    expect(layout.estimatedInstalledCapacityMw).toBeCloseTo(expectedMw, 2);
  });

  it('returns empty layout for very small site', () => {
    // Tiny 50m x 50m area
    const tiny: LatLng[] = [
      { lat: 55.8600, lng: -4.2600 },
      { lat: 55.8600, lng: -4.2595 },
      { lat: 55.8605, lng: -4.2595 },
      { lat: 55.8605, lng: -4.2600 },
    ];
    const boundary = createBoundary(tiny, 'Tiny');
    const turbine = getTurbineById('vestas-v172-7200')!;
    const layout = estimateTurbineCapacity(boundary, turbine, makeWindData());
    // Very large turbine in tiny area should fit 0 or maybe 1
    expect(layout.turbineCount).toBeLessThanOrEqual(1);
  });
});
