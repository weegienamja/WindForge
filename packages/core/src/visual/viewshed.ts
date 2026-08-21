// Viewshed (Zone of Theoretical Visibility) calculator.
//
// Determines which areas on an elevation grid have line-of-sight to one
// or more wind turbines, accounting for terrain obstruction and earth
// curvature. Used for visual impact assessment.

import type { ElevationGrid } from '../types/terrain.js';
import type { TurbinePosition } from '../types/wake.js';
import { distanceKm } from '../utils/geo.js';

export interface ViewshedCell {
  lat: number;
  lng: number;
  distanceKm: number;
  turbinesVisible: number;
}

export interface ViewshedResult {
  visibleCells: ViewshedCell[];
  totalCells: number;
  visiblePercent: number;
  maxVisibilityDistanceKm: number;
}

const EARTH_RADIUS_M = 6_371_000;

/**
 * Correction for earth curvature at a given distance.
 * At distance d from the observer, the surface drops by approximately
 * d^2 / (2 * R_earth) metres.
 */
function earthCurvatureCorrectionM(distanceM: number): number {
  return (distanceM * distanceM) / (2 * EARTH_RADIUS_M);
}

/**
 * Interpolate elevation between two known grid points using linear interpolation.
 * `fraction` is in [0, 1] where 0 = point A, 1 = point B.
 */
function lerp(a: number, b: number, fraction: number): number {
  return a + (b - a) * fraction;
}

/**
 * Get the elevation at a specific lat/lng by bilinear interpolation on the grid.
 * Returns undefined if the point falls outside the grid.
 */
function getElevationAt(grid: ElevationGrid, lat: number, lng: number): number | undefined {
  if (grid.rows === 0 || grid.cols === 0) return undefined;

  const firstRow = grid.points[0]!;
  const lastRow = grid.points[grid.rows - 1]!;
  const minLat = firstRow[0]!.lat;
  const maxLat = lastRow[0]!.lat;
  const minLng = firstRow[0]!.lng;
  const maxLng = firstRow[grid.cols - 1]!.lng;

  if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) return undefined;

  // Map to fractional row/col indices
  const rowFrac = ((lat - minLat) / (maxLat - minLat)) * (grid.rows - 1);
  const colFrac = ((lng - minLng) / (maxLng - minLng)) * (grid.cols - 1);

  const r0 = Math.floor(rowFrac);
  const c0 = Math.floor(colFrac);
  const r1 = Math.min(r0 + 1, grid.rows - 1);
  const c1 = Math.min(c0 + 1, grid.cols - 1);

  const rFrac = rowFrac - r0;
  const cFrac = colFrac - c0;

  const e00 = grid.points[r0]![c0]!.elevationM;
  const e01 = grid.points[r0]![c1]!.elevationM;
  const e10 = grid.points[r1]![c0]!.elevationM;
  const e11 = grid.points[r1]![c1]!.elevationM;

  const top = lerp(e00, e01, cFrac);
  const bottom = lerp(e10, e11, cFrac);
  return lerp(top, bottom, rFrac);
}

/**
 * Check line-of-sight from an observer point to a turbine tip.
 *
 * Samples terrain elevation at intervals along the path from observer to
 * turbine. If any sampled terrain point (corrected for earth curvature)
 * blocks the sight line to the turbine tip, the turbine is not visible.
 *
 * @param observer - Observer ground location and elevation
 * @param turbineBase - Turbine base location
 * @param turbineBaseElevM - Terrain elevation at turbine base
 * @param turbineTipHeightM - Total height of turbine tip above ground (hub + rotor/2)
 * @param grid - Elevation grid for terrain sampling
 * @param sampleCount - Number of intermediate samples along the sight line
 */
function hasLineOfSight(
  observerLat: number,
  observerLng: number,
  observerElevM: number,
  turbineLat: number,
  turbineLng: number,
  turbineBaseElevM: number,
  turbineTipHeightM: number,
  totalDistanceM: number,
  grid: ElevationGrid,
  sampleCount: number,
): boolean {
  // Observer eye height (1.5m above ground)
  const observerHeightM = observerElevM + 1.5;

  // Target: turbine tip (base elevation + hub height + rotor radius)
  const targetHeightM = turbineBaseElevM + turbineTipHeightM;

  // Apply earth curvature correction to the target
  const targetCorrectedM = targetHeightM - earthCurvatureCorrectionM(totalDistanceM);

  // Angle from observer to target
  const targetAngle = (targetCorrectedM - observerHeightM) / totalDistanceM;

  // Check intermediate points for obstruction
  for (let i = 1; i < sampleCount; i++) {
    const fraction = i / sampleCount;
    const sampleLat = observerLat + (turbineLat - observerLat) * fraction;
    const sampleLng = observerLng + (turbineLng - observerLng) * fraction;
    const sampleDistM = totalDistanceM * fraction;

    const terrainElevM = getElevationAt(grid, sampleLat, sampleLng);
    if (terrainElevM === undefined) continue; // outside grid, assume no obstruction

    // Apply earth curvature at this distance
    const correctedTerrainM = terrainElevM - earthCurvatureCorrectionM(sampleDistM);

    // Angle from observer to terrain at this point
    const terrainAngle = (correctedTerrainM - observerHeightM) / sampleDistM;

    if (terrainAngle > targetAngle) {
      return false; // terrain blocks line of sight
    }
  }

  return true;
}

/**
 * Compute the Zone of Theoretical Visibility (ZTV) for one or more turbines.
 *
 * For each cell in the elevation grid within the specified radius, determines
 * how many of the given turbines are visible, accounting for terrain obstruction
 * and earth curvature.
 *
 * @param turbines - Turbine positions with hub height and rotor diameter
 * @param elevationGrid - Elevation grid covering the assessment area
 * @param radiusKm - Maximum assessment radius (default: 30km)
 * @param sampleInterval - Number of terrain samples per sight line (default: 50)
 */
export function computeViewshed(
  turbines: TurbinePosition[],
  elevationGrid: ElevationGrid,
  radiusKm: number = 30,
  sampleInterval: number = 50,
): ViewshedResult {
  if (turbines.length === 0 || elevationGrid.rows === 0 || elevationGrid.cols === 0) {
    return { visibleCells: [], totalCells: 0, visiblePercent: 0, maxVisibilityDistanceKm: 0 };
  }

  const visibleCells: ViewshedCell[] = [];
  let totalCells = 0;
  let maxDistKm = 0;

  // Pre-compute turbine base elevations and tip heights
  const turbineInfo = turbines.map((t) => {
    const baseElev = getElevationAt(elevationGrid, t.location.lat, t.location.lng) ?? 0;
    const tipHeight = t.hubHeightM + t.rotorDiameterM / 2;
    return { ...t, baseElevM: baseElev, tipHeightM: tipHeight };
  });

  // Iterate over all grid cells
  for (let r = 0; r < elevationGrid.rows; r++) {
    for (let c = 0; c < elevationGrid.cols; c++) {
      const cell = elevationGrid.points[r]![c]!;

      // Check distance to nearest turbine - skip if beyond radius
      let withinRadius = false;
      for (const turbInfo of turbineInfo) {
        const d = distanceKm({ lat: cell.lat, lng: cell.lng }, turbInfo.location);
        if (d <= radiusKm) {
          withinRadius = true;
          break;
        }
      }
      if (!withinRadius) continue;

      totalCells++;

      let turbinesVisible = 0;

      for (const turbInfo of turbineInfo) {
        const dKm = distanceKm({ lat: cell.lat, lng: cell.lng }, turbInfo.location);
        if (dKm > radiusKm) continue;

        const dM = dKm * 1000;
        if (dM < 1) {
          // Observer is at the turbine base - always visible
          turbinesVisible++;
          continue;
        }

        const visible = hasLineOfSight(
          cell.lat,
          cell.lng,
          cell.elevationM,
          turbInfo.location.lat,
          turbInfo.location.lng,
          turbInfo.baseElevM,
          turbInfo.tipHeightM,
          dM,
          elevationGrid,
          sampleInterval,
        );

        if (visible) {
          turbinesVisible++;
          if (dKm > maxDistKm) maxDistKm = dKm;
        }
      }

      if (turbinesVisible > 0) {
        visibleCells.push({
          lat: cell.lat,
          lng: cell.lng,
          distanceKm:
            Math.round(
              Math.min(
                ...turbineInfo.map((t) => distanceKm({ lat: cell.lat, lng: cell.lng }, t.location)),
              ) * 100,
            ) / 100,
          turbinesVisible,
        });
      }
    }
  }

  const visiblePercent =
    totalCells > 0 ? Math.round((visibleCells.length / totalCells) * 10000) / 100 : 0;

  return {
    visibleCells,
    totalCells,
    visiblePercent,
    maxVisibilityDistanceKm: Math.round(maxDistKm * 100) / 100,
  };
}
