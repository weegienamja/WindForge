import { describe, it, expect } from 'vitest';
import {
  generateGridCoordinates,
  createElevationGrid,
  computeTerrainSpeedUp,
  calculateRix,
} from '../src/index.js';
import type { ElevationGridPoint, ElevationGrid } from '../src/types/terrain.js';
import type { BoundingBox } from '../src/types/site.js';

// ─── Grid Generation ───

describe('generateGridCoordinates', () => {
  const bb: BoundingBox = {
    north: 55.01,
    south: 55.0,
    east: -2.99,
    west: -3.01,
  };

  it('generates a 2D grid within the bounding box', () => {
    const grid = generateGridCoordinates(bb, 200);
    expect(grid.length).toBeGreaterThan(0);
    expect(grid[0]!.length).toBeGreaterThan(0);

    // All points should be within bounds
    for (const row of grid) {
      for (const pt of row) {
        expect(pt.lat).toBeGreaterThanOrEqual(bb.south);
        expect(pt.lat).toBeLessThanOrEqual(bb.north + 0.001);
        expect(pt.lng).toBeGreaterThanOrEqual(bb.west);
        expect(pt.lng).toBeLessThanOrEqual(bb.east + 0.001);
      }
    }
  });

  it('produces more points with smaller spacing', () => {
    const coarse = generateGridCoordinates(bb, 500);
    const fine = generateGridCoordinates(bb, 100);
    const coarseCount = coarse.reduce((sum, row) => sum + row.length, 0);
    const fineCount = fine.reduce((sum, row) => sum + row.length, 0);
    expect(fineCount).toBeGreaterThan(coarseCount);
  });

  it('returns rows with consistent column count', () => {
    const grid = generateGridCoordinates(bb, 200);
    const firstRowLen = grid[0]!.length;
    for (const row of grid) {
      expect(row.length).toBe(firstRowLen);
    }
  });

  it('handles very small bounding box', () => {
    const smallBb: BoundingBox = {
      north: 55.0001,
      south: 55.0,
      east: -3.0,
      west: -3.0001,
    };
    const grid = generateGridCoordinates(smallBb, 50);
    expect(grid.length).toBeGreaterThan(0);
  });
});

describe('createElevationGrid', () => {
  it('computes min and max elevation', () => {
    const points: ElevationGridPoint[][] = [
      [
        { lat: 55, lng: -3, elevationM: 100 },
        { lat: 55, lng: -2.99, elevationM: 200 },
      ],
      [
        { lat: 55.01, lng: -3, elevationM: 50 },
        { lat: 55.01, lng: -2.99, elevationM: 300 },
      ],
    ];
    const grid = createElevationGrid(points, 100);
    expect(grid.minElevationM).toBe(50);
    expect(grid.maxElevationM).toBe(300);
    expect(grid.rows).toBe(2);
    expect(grid.cols).toBe(2);
    expect(grid.spacingM).toBe(100);
  });

  it('handles empty grid', () => {
    const grid = createElevationGrid([], 100);
    expect(grid.rows).toBe(0);
    expect(grid.cols).toBe(0);
    expect(grid.minElevationM).toBe(0);
    expect(grid.maxElevationM).toBe(0);
  });
});

// ─── Terrain Speed-Up ───

describe('computeTerrainSpeedUp', () => {
  function makeGrid(elevations: number[][], spacingM: number): ElevationGrid {
    const points: ElevationGridPoint[][] = elevations.map((row, r) =>
      row.map((elev, c) => ({
        lat: 55 + r * 0.001,
        lng: -3 + c * 0.001,
        elevationM: elev,
      })),
    );
    return createElevationGrid(points, spacingM);
  }

  it('returns ~1.0 for flat terrain', () => {
    // 10x10 grid of flat terrain at 100m
    const flat = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 100));
    const grid = makeGrid(flat, 100);
    const result = computeTerrainSpeedUp(grid, 0.03);

    expect(result.rows).toBe(10);
    expect(result.cols).toBe(10);
    // All speed-up factors should be ~1.0 for flat terrain
    for (const row of result.points) {
      for (const pt of row) {
        expect(pt.speedUpFactor).toBeCloseTo(1.0, 1);
      }
    }
    expect(result.meanSpeedUp).toBeCloseTo(1.0, 1);
  });

  it('returns speed-up > 1.0 at a ridge/hilltop', () => {
    // Create a hill: centre is elevated, edges are lower
    const size = 11;
    const centre = Math.floor(size / 2);
    const hill = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => {
        const dx = c - centre;
        const dy = r - centre;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return Math.max(0, 100 - dist * 20); // peak at 100m, drops to 0
      }),
    );
    const grid = makeGrid(hill, 100);
    const result = computeTerrainSpeedUp(grid, 0.03);

    // Centre point should have speed-up > 1.0
    const centreSU = result.points[centre]![centre]!.speedUpFactor;
    expect(centreSU).toBeGreaterThan(1.0);
    expect(result.maxSpeedUp).toBeGreaterThan(1.0);
  });

  it('returns speed-up < 1.0 in a valley', () => {
    // Create a valley: centre is depressed, edges are higher
    const size = 11;
    const centre = Math.floor(size / 2);
    const valley = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => {
        const dx = c - centre;
        const dy = r - centre;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return Math.min(100, dist * 20); // dip at 0m, rises to 100m
      }),
    );
    const grid = makeGrid(valley, 100);
    const result = computeTerrainSpeedUp(grid, 0.03);

    // Centre point should have speed-up < 1.0
    const centreSU = result.points[centre]![centre]!.speedUpFactor;
    expect(centreSU).toBeLessThan(1.0);
    expect(result.minSpeedUp).toBeLessThan(1.0);
  });

  it('handles different roughness lengths', () => {
    const size = 11;
    const centre = Math.floor(size / 2);
    const hill = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => {
        const dx = c - centre;
        const dy = r - centre;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return Math.max(0, 50 - dist * 10);
      }),
    );
    const grid = makeGrid(hill, 100);
    const smooth = computeTerrainSpeedUp(grid, 0.001);
    const rough = computeTerrainSpeedUp(grid, 1.0);

    // Higher roughness should produce different speed-up factors
    const smoothCentre = smooth.points[centre]![centre]!.speedUpFactor;
    const roughCentre = rough.points[centre]![centre]!.speedUpFactor;
    // The effect direction depends on the formula but they should differ
    expect(smoothCentre).not.toBeCloseTo(roughCentre, 3);
  });

  it('clamps speed-up to physical bounds [0.5, 2.0]', () => {
    // Even with extreme terrain, factors should be clamped
    const extreme = Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => (r === 2 && c === 2 ? 1000 : 0)),
    );
    const grid = makeGrid(extreme, 50);
    const result = computeTerrainSpeedUp(grid, 0.03);

    for (const row of result.points) {
      for (const pt of row) {
        expect(pt.speedUpFactor).toBeGreaterThanOrEqual(0.5);
        expect(pt.speedUpFactor).toBeLessThanOrEqual(2.0);
      }
    }
  });

  it('produces consistent grid dimensions', () => {
    const grid = makeGrid(
      Array.from({ length: 5 }, () => Array.from({ length: 8 }, () => 100)),
      100,
    );
    const result = computeTerrainSpeedUp(grid, 0.03);
    expect(result.rows).toBe(5);
    expect(result.cols).toBe(8);
    expect(result.points.length).toBe(5);
    expect(result.points[0]!.length).toBe(8);
  });
});

// ─── RIX Calculator ───

describe('calculateRix', () => {
  function makeGrid(elevations: number[][], spacingM: number): ElevationGrid {
    const points: ElevationGridPoint[][] = elevations.map((row, r) =>
      row.map((elev, c) => ({
        lat: 55 + r * 0.001,
        lng: -3 + c * 0.001,
        elevationM: elev,
      })),
    );
    return createElevationGrid(points, spacingM);
  }

  it('returns ~0% RIX for flat terrain', () => {
    const flat = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 100));
    const grid = makeGrid(flat, 100);
    const result = calculateRix(grid, { lat: 55.01, lng: -3.01 }, 1.0, 30);

    expect(result.rixPercent).toBe(0);
    expect(result.flowModelReliability).toBe('high');
    expect(result.exceedingFraction).toBe(0);
  });

  it('returns high RIX for very rugged terrain', () => {
    // Create terrain with steep slopes (alternating high and low)
    const rugged = Array.from({ length: 20 }, (_, r) =>
      Array.from({ length: 20 }, (_, c) => ((r + c) % 2 === 0 ? 500 : 0)),
    );
    const grid = makeGrid(rugged, 100);
    const result = calculateRix(grid, { lat: 55.01, lng: -3.01 }, 1.0, 30);

    // 500m change over 100m = 500% slope, way above 30% threshold
    expect(result.rixPercent).toBeGreaterThan(50);
    expect(result.flowModelReliability).toBe('low');
  });

  it('classifies moderate terrain correctly', () => {
    // Gentle slopes: ~10-20% slope in some directions
    const size = 20;
    const gentle = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => {
        // Create a gentle slope in one direction only
        return r * 5; // 5m per 100m = 5% slope, below 30% threshold
      }),
    );
    const grid = makeGrid(gentle, 100);
    const result = calculateRix(grid, { lat: 55.01, lng: -3.01 }, 1.0, 30);

    expect(result.rixPercent).toBeLessThan(5);
    expect(result.flowModelReliability).toBe('high');
  });

  it('uses different critical slope thresholds', () => {
    const moderate = Array.from(
      { length: 20 },
      (_, r) => Array.from({ length: 20 }, (_, c) => r * 25), // 25m per 100m = 25% slope
    );
    const grid = makeGrid(moderate, 100);

    const low = calculateRix(grid, { lat: 55.01, lng: -3.01 }, 1.0, 20);
    const high = calculateRix(grid, { lat: 55.01, lng: -3.01 }, 1.0, 30);

    // Lower threshold should give higher RIX
    expect(low.rixPercent).toBeGreaterThanOrEqual(high.rixPercent);
  });

  it('returns meaningful summary string', () => {
    const flat = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 100));
    const grid = makeGrid(flat, 100);
    const result = calculateRix(grid, { lat: 55.01, lng: -3.01 }, 1.0, 30);

    expect(result.summary).toContain('RIX');
    expect(result.summary).toContain('%');
    expect(result.summary).toContain('linear flow modelling');
  });

  it('reports correct profile count', () => {
    const flat = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 100));
    const grid = makeGrid(flat, 100);
    const result = calculateRix(grid, { lat: 55.01, lng: -3.01 }, 1.0, 30);

    // 36 directions (every 10 degrees)
    expect(result.profileCount).toBe(36);
  });
});
