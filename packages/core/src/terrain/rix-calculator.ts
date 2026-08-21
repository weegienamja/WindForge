import type { LatLng } from '../types/analysis.js';
import type { ElevationGrid, ElevationGridPoint } from '../types/terrain.js';
import type { RixResult } from '../types/terrain.js';

/**
 * Calculate the Ruggedness Index (RIX) at a specific point within an elevation grid.
 *
 * RIX = percentage of terrain along radial profiles that exceeds a critical slope.
 * High RIX (>5%) indicates flow separation risk, reducing confidence in linear flow models.
 *
 * @param grid - Elevation grid covering the area
 * @param point - Point to calculate RIX at
 * @param radiusKm - Analysis radius in km (default: 3.5)
 * @param criticalSlopePercent - Critical slope threshold in percent (default: 30)
 * @returns RIX result with percentage and model reliability assessment
 */
export function calculateRix(
  grid: ElevationGrid,
  point: LatLng,
  radiusKm: number = 3.5,
  criticalSlopePercent: number = 30,
): RixResult {
  const { points, spacingM, rows, cols } = grid;

  // Find the nearest grid cell to the target point
  const { row: centreRow, col: centreCol } = findNearestCell(points, point);

  // Radius in grid cells
  const radiusM = radiusKm * 1000;
  const radiusCells = Math.round(radiusM / spacingM);

  // Analyse radial profiles in 36 directions (every 10 degrees)
  const numDirections = 36;
  let totalSegments = 0;
  let exceedingSegments = 0;

  for (let d = 0; d < numDirections; d++) {
    const angleDeg = (d * 360) / numDirections;
    const angleRad = (angleDeg * Math.PI) / 180;
    const dRow = -Math.cos(angleRad); // north = negative row index
    const dCol = Math.sin(angleRad);

    // Walk along the profile
    let prevElev = points[centreRow]?.[centreCol]?.elevationM ?? 0;
    let prevDist = 0;

    for (let step = 1; step <= radiusCells; step++) {
      const r = Math.round(centreRow + step * dRow);
      const c = Math.round(centreCol + step * dCol);

      if (r < 0 || r >= rows || c < 0 || c >= cols) break;

      const elev = points[r]![c]!.elevationM;
      const dist = step * spacingM;
      const segmentDist = dist - prevDist;

      if (segmentDist > 0) {
        const slopePercent = (Math.abs(elev - prevElev) / segmentDist) * 100;

        totalSegments++;
        if (slopePercent > criticalSlopePercent) {
          exceedingSegments++;
        }
      }

      prevElev = elev;
      prevDist = dist;
    }
  }

  const rixPercent = totalSegments > 0 ? (exceedingSegments / totalSegments) * 100 : 0;
  const exceedingFraction = totalSegments > 0 ? exceedingSegments / totalSegments : 0;

  let flowModelReliability: 'high' | 'moderate' | 'low';
  let reliabilityText: string;

  if (rixPercent < 5) {
    flowModelReliability = 'high';
    reliabilityText =
      'The RIX screen indicates fewer terrain-complexity concerns for linear flow modelling.';
  } else if (rixPercent < 15) {
    flowModelReliability = 'moderate';
    reliabilityText =
      'Some flow separation risk. Linear model results should be treated with caution.';
  } else {
    flowModelReliability = 'low';
    reliabilityText =
      'The RIX screen indicates substantial flow-separation risk; site-specific flow modelling is recommended.';
  }

  return {
    rixPercent: Math.round(rixPercent * 10) / 10,
    profileCount: numDirections,
    exceedingFraction: Math.round(exceedingFraction * 1000) / 1000,
    flowModelReliability,
    summary: `RIX: ${rixPercent.toFixed(1)}% (${exceedingSegments}/${totalSegments} segments exceed ${criticalSlopePercent}% slope). ${reliabilityText}`,
  };
}

/**
 * Calculate RIX values across an entire grid.
 * Returns a 2D array matching the grid dimensions.
 */
export function calculateRixGrid(
  grid: ElevationGrid,
  radiusKm: number = 3.5,
  criticalSlopePercent: number = 30,
): RixResult[][] {
  const results: RixResult[][] = [];

  for (let r = 0; r < grid.rows; r++) {
    const row: RixResult[] = [];
    for (let c = 0; c < grid.cols; c++) {
      const point: LatLng = {
        lat: grid.points[r]![c]!.lat,
        lng: grid.points[r]![c]!.lng,
      };
      row.push(calculateRix(grid, point, radiusKm, criticalSlopePercent));
    }
    results.push(row);
  }

  return results;
}

/**
 * Find the nearest grid cell to a given coordinate.
 */
function findNearestCell(
  points: ElevationGridPoint[][],
  target: LatLng,
): { row: number; col: number } {
  let bestRow = 0;
  let bestCol = 0;
  let bestDist = Infinity;

  for (let r = 0; r < points.length; r++) {
    const row = points[r]!;
    for (let c = 0; c < row.length; c++) {
      const pt = row[c]!;
      const dist = (pt.lat - target.lat) ** 2 + (pt.lng - target.lng) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestRow = r;
        bestCol = c;
      }
    }
  }

  return { row: bestRow, col: bestCol };
}
