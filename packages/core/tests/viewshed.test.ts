import { describe, it, expect } from 'vitest';
import { computeViewshed } from '../src/visual/viewshed.js';
import type { ElevationGrid } from '../src/types/terrain.js';
import type { TurbinePosition } from '../src/types/wake.js';

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

/**
 * Create a flat elevation grid of the given size.
 * Grid origin at (baseLat, baseLng), spacing in degrees.
 */
function makeFlatGrid(
  rows: number,
  cols: number,
  baseLat: number,
  baseLng: number,
  spacingDeg: number,
  elevationM: number = 100,
): ElevationGrid {
  const points = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({
        lat: baseLat + r * spacingDeg,
        lng: baseLng + c * spacingDeg,
        elevationM,
      });
    }
    points.push(row);
  }
  return {
    points,
    spacingM: spacingDeg * 111_320,
    rows,
    cols,
    minElevationM: elevationM,
    maxElevationM: elevationM,
  };
}

/**
 * Create a grid with a hill ridge blocking sight from one side.
 */
function makeGridWithHill(
  rows: number,
  cols: number,
  baseLat: number,
  baseLng: number,
  spacingDeg: number,
  baseElevM: number,
  hillRow: number,
  hillElevM: number,
): ElevationGrid {
  let minElev = baseElevM;
  let maxElev = baseElevM;
  const points = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const e = r === hillRow ? hillElevM : baseElevM;
      if (e < minElev) minElev = e;
      if (e > maxElev) maxElev = e;
      row.push({
        lat: baseLat + r * spacingDeg,
        lng: baseLng + c * spacingDeg,
        elevationM: e,
      });
    }
    points.push(row);
  }
  return {
    points,
    spacingM: spacingDeg * 111_320,
    rows,
    cols,
    minElevationM: minElev,
    maxElevationM: maxElev,
  };
}

function makeTurbine(
  lat: number,
  lng: number,
  hubHeightM: number = 80,
  rotorDiameterM: number = 100,
): TurbinePosition {
  return { id: 1, location: { lat, lng }, hubHeightM, rotorDiameterM };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Viewshed', () => {
  it('returns empty result for no turbines', () => {
    const grid = makeFlatGrid(5, 5, 55.0, -4.0, 0.001);
    const result = computeViewshed([], grid, 10);
    expect(result.totalCells).toBe(0);
    expect(result.visibleCells).toHaveLength(0);
    expect(result.visiblePercent).toBe(0);
  });

  it('returns empty result for empty grid', () => {
    const grid: ElevationGrid = {
      points: [],
      spacingM: 100,
      rows: 0,
      cols: 0,
      minElevationM: 0,
      maxElevationM: 0,
    };
    const turbine = makeTurbine(55.0, -4.0);
    const result = computeViewshed([turbine], grid, 10);
    expect(result.totalCells).toBe(0);
  });

  it('flat terrain - all cells within radius are visible', () => {
    // Small flat grid, turbine in the centre
    const rows = 11;
    const cols = 11;
    const spacingDeg = 0.001; // ~111m
    const baseLat = 55.0;
    const baseLng = -4.0;
    const grid = makeFlatGrid(rows, cols, baseLat, baseLng, spacingDeg, 50);

    const centreRow = 5;
    const centreCol = 5;
    const turbine = makeTurbine(
      baseLat + centreRow * spacingDeg,
      baseLng + centreCol * spacingDeg,
      80,
      100,
    );

    const result = computeViewshed([turbine], grid, 5, 20);

    // All cells on flat terrain should be visible
    expect(result.visiblePercent).toBe(100);
    expect(result.visibleCells.length).toBe(result.totalCells);
  });

  it('hill blocks visibility behind it', () => {
    // Grid: rows 0-2 are base elevation (100m), row 3 is a 500m hill,
    // rows 4-6 are base elevation again.
    // Turbine at row 0 (north). Hill at row 3 should block rows 4-6.
    const rows = 7;
    const cols = 3;
    const spacingDeg = 0.005; // ~557m per step
    const baseLat = 55.0;
    const baseLng = -4.0;

    const grid = makeGridWithHill(
      rows,
      cols,
      baseLat,
      baseLng,
      spacingDeg,
      100, // base elevation
      3, // hill at row 3
      500, // hill height 500m
    );

    const turbine = makeTurbine(
      baseLat + 0 * spacingDeg, // row 0
      baseLng + 1 * spacingDeg, // col 1
      80,
      100,
    );

    const result = computeViewshed([turbine], grid, 10, 30);

    // Cells behind the hill (rows 4-6) should NOT be visible
    // The turbine tip is at 100 + 80 + 50 = 230m, but hill is at 500m
    // So the hill clearly blocks the view
    const behindHill = result.visibleCells.filter((cell) => cell.lat > baseLat + 3.5 * spacingDeg);
    expect(behindHill.length).toBe(0);

    // Cells in front of hill (rows 0-2) should be visible
    const inFrontOfHill = result.visibleCells.filter((cell) => cell.lat < baseLat + 3 * spacingDeg);
    expect(inFrontOfHill.length).toBeGreaterThan(0);
  });

  it('multi-turbine visibility count', () => {
    const rows = 5;
    const cols = 5;
    const spacingDeg = 0.002;
    const baseLat = 55.0;
    const baseLng = -4.0;
    const grid = makeFlatGrid(rows, cols, baseLat, baseLng, spacingDeg, 10);

    const turbines: TurbinePosition[] = [
      makeTurbine(baseLat + 1 * spacingDeg, baseLng + 1 * spacingDeg, 80, 100),
      { ...makeTurbine(baseLat + 3 * spacingDeg, baseLng + 3 * spacingDeg, 80, 100), id: 2 },
    ];

    const result = computeViewshed(turbines, grid, 5, 20);

    // On flat terrain, all cells should see both turbines
    const allSeeBoth = result.visibleCells.every((c) => c.turbinesVisible === 2);
    expect(allSeeBoth).toBe(true);
  });

  it('cells beyond radius are excluded', () => {
    const rows = 21;
    const cols = 21;
    const spacingDeg = 0.01; // ~1.1km spacing
    const baseLat = 55.0;
    const baseLng = -4.0;
    const grid = makeFlatGrid(rows, cols, baseLat, baseLng, spacingDeg, 0);

    const turbine = makeTurbine(
      baseLat + 10 * spacingDeg, // centre
      baseLng + 10 * spacingDeg,
    );

    // Use a small radius (2km) so many cells should be excluded
    const result = computeViewshed([turbine], grid, 2, 10);

    expect(result.totalCells).toBeLessThan(rows * cols);
    // All visible cells should be within the radius
    for (const cell of result.visibleCells) {
      expect(cell.distanceKm).toBeLessThanOrEqual(2.01);
    }
  });

  it('earth curvature reduces visibility at long distances', () => {
    // At 30km, earth curvature drops ~70m.
    // Create a grid with long sight lines. Turbine at one end, observer at the other.
    // On perfectly flat terrain at 30km, a 130m turbine tip (80+50) should still
    // be visible because 130m > 70m curvature drop. But at 50km, drop is ~196m,
    // so the turbine would not be visible.
    const rows = 5;
    const cols = 2;
    // Make spacing so that last row is ~50km away
    const spacingDeg = 0.12; // ~13.4km per step
    const baseLat = 55.0;
    const baseLng = -4.0;
    const grid = makeFlatGrid(rows, cols, baseLat, baseLng, spacingDeg, 0);

    const turbine = makeTurbine(baseLat, baseLng, 80, 100); // tip at 130m

    // Radius 60km to include all cells
    const result = computeViewshed([turbine], grid, 60, 30);

    // Distance from row 0 to row 4: ~53.6km
    // At that distance curvature correction = 53600^2 / (2*6371000) = ~225m
    // Turbine tip at 130m, observer at 0. The target would be at 130-225 = -95m,
    // well below observer sight line. So the last row should NOT be visible.
    const distantCells = result.visibleCells.filter((c) => c.distanceKm > 50);
    expect(distantCells.length).toBe(0);

    // Nearby cells (< 15km) should be visible
    const nearbyCells = result.visibleCells.filter((c) => c.distanceKm < 15);
    expect(nearbyCells.length).toBeGreaterThan(0);
  });

  it('very close observer always sees turbine', () => {
    const grid = makeFlatGrid(3, 3, 55.0, -4.0, 0.0001, 0);
    // Turbine right at the centre of the grid
    const turbine = makeTurbine(55.0 + 0.0001, -4.0 + 0.0001, 80, 100);
    const result = computeViewshed([turbine], grid, 5, 10);

    // The cell at the turbine location should be visible
    expect(result.visibleCells.length).toBeGreaterThan(0);
  });

  it('maintains maxVisibilityDistanceKm', () => {
    const grid = makeFlatGrid(5, 5, 55.0, -4.0, 0.005, 0);
    const turbine = makeTurbine(55.01, -3.99, 80, 100);
    const result = computeViewshed([turbine], grid, 20, 10);

    expect(result.maxVisibilityDistanceKm).toBeGreaterThan(0);
    // All visible cells should be at or below max distance
    for (const cell of result.visibleCells) {
      expect(cell.distanceKm).toBeLessThanOrEqual(result.maxVisibilityDistanceKm + 0.1);
    }
  });

  it('visiblePercent is in [0, 100]', () => {
    const grid = makeFlatGrid(5, 5, 55.0, -4.0, 0.001, 0);
    const turbine = makeTurbine(55.002, -3.998, 80, 100);
    const result = computeViewshed([turbine], grid, 5, 10);
    expect(result.visiblePercent).toBeGreaterThanOrEqual(0);
    expect(result.visiblePercent).toBeLessThanOrEqual(100);
  });

  it('tall turbine is visible behind a moderate hill', () => {
    // Hill at 150m, turbine behind it at 100m base, but tip at 100+80+50=230m
    // Observer at row 0 (100m). Angle to hill (150m at ~668m) < angle to tip (230m at ~1336m)
    // So the turbine tip should be visible above the hill.
    const rows = 5;
    const cols = 3;
    const spacingDeg = 0.003;
    const baseLat = 55.0;
    const baseLng = -4.0;

    const grid = makeGridWithHill(
      rows,
      cols,
      baseLat,
      baseLng,
      spacingDeg,
      100, // base elevation
      2, // hill at row 2
      150, // hill height 150m (moderate - tip at 230m rises above it)
    );

    // Turbine at row 4 (behind the hill from row 0)
    const turbine = makeTurbine(baseLat + 4 * spacingDeg, baseLng + 1 * spacingDeg, 80, 100);

    const result = computeViewshed([turbine], grid, 10, 30);

    // Observer at row 0 should see the turbine because tip (230m) > hill (200m)
    const row0Cells = result.visibleCells.filter((cell) => cell.lat < baseLat + 0.5 * spacingDeg);
    expect(row0Cells.length).toBeGreaterThan(0);
  });
});
