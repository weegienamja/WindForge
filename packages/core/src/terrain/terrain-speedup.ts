import type {
  ElevationGrid,
  ElevationGridPoint,
  SpeedUpGrid,
  SpeedUpPoint,
} from '../types/terrain.js';

/**
 * Compute terrain speed-up factors across an elevation grid using a simplified
 * Jackson-Hunt linear theory model.
 *
 * For each grid point, analyses elevation profiles in 8 directions (45-degree sectors)
 * to determine relative elevation above/below surrounding terrain, then computes
 * a fractional speed-up ratio (FSR).
 *
 * FSR = 1 + 2 * H / (L * ln(L / z0))
 *
 * Where H = effective hill height (relative elevation), L = hill half-width,
 * z0 = surface roughness length.
 *
 * @param grid - Elevation grid across the site
 * @param roughnessLengthM - Surface roughness length in metres (default: 0.03 for open terrain)
 * @returns Grid of speed-up factors
 */
export function computeTerrainSpeedUp(
  grid: ElevationGrid,
  roughnessLengthM: number = 0.03,
): SpeedUpGrid {
  const { rows, cols, points, spacingM } = grid;

  // Analysis radius in grid cells (look ~500m in each direction, capped at grid extent)
  const radiusCells = Math.max(
    1,
    Math.min(Math.round(500 / spacingM), Math.floor(Math.min(rows, cols) / 2)),
  );

  const z0 = Math.max(roughnessLengthM, 0.001); // prevent log(0)

  const speedUpPoints: SpeedUpPoint[][] = [];

  let maxSpeedUp = -Infinity;
  let minSpeedUp = Infinity;
  let totalSpeedUp = 0;
  let count = 0;

  for (let r = 0; r < rows; r++) {
    const row: SpeedUpPoint[] = [];
    for (let c = 0; c < cols; c++) {
      // Analyse in 8 directions
      const directions = [
        [0, 1], // east
        [0, -1], // west
        [1, 0], // south
        [-1, 0], // north
        [1, 1], // southeast
        [1, -1], // southwest
        [-1, 1], // northeast
        [-1, -1], // northwest
      ] as const;

      let totalHillHeight = 0;
      let totalHillHalfWidth = 0;
      let validDirections = 0;

      for (const [dr, dc] of directions) {
        const { hillHeightM, hillHalfWidthM } = analyseProfile(
          points,
          r,
          c,
          dr,
          dc,
          radiusCells,
          spacingM,
        );

        if (hillHalfWidthM > 0) {
          totalHillHeight += hillHeightM;
          totalHillHalfWidth += hillHalfWidthM;
          validDirections++;
        }
      }

      let speedUpFactor = 1.0;

      if (validDirections > 0) {
        const avgH = totalHillHeight / validDirections;
        const avgL = totalHillHalfWidth / validDirections;

        if (avgL > 0) {
          const lnRatio = Math.log(avgL / z0);
          if (lnRatio > 0) {
            // Jackson-Hunt simplified: FSR = 1 + 2 * H / (L * ln(L/z0))
            speedUpFactor = 1 + (2 * avgH) / (avgL * lnRatio);
          }
        }
      }

      // Clamp to physical bounds (0.5 - 2.0)
      speedUpFactor = Math.max(0.5, Math.min(2.0, speedUpFactor));

      row.push({
        lat: points[r]![c]!.lat,
        lng: points[r]![c]!.lng,
        speedUpFactor,
      });

      if (speedUpFactor > maxSpeedUp) maxSpeedUp = speedUpFactor;
      if (speedUpFactor < minSpeedUp) minSpeedUp = speedUpFactor;
      totalSpeedUp += speedUpFactor;
      count++;
    }
    speedUpPoints.push(row);
  }

  return {
    points: speedUpPoints,
    rows,
    cols,
    maxSpeedUp: maxSpeedUp === -Infinity ? 1.0 : maxSpeedUp,
    minSpeedUp: minSpeedUp === Infinity ? 1.0 : minSpeedUp,
    meanSpeedUp: count > 0 ? totalSpeedUp / count : 1.0,
  };
}

/**
 * Analyse an elevation profile in one direction from a centre point to determine
 * the effective hill height and half-width.
 *
 * Hill height = centre elevation minus the average of the surrounding terrain in this direction.
 * Positive = ridge/hilltop, negative = valley.
 * Hill half-width = distance from centre to the point where terrain reaches half the hill height.
 */
function analyseProfile(
  points: ElevationGridPoint[][],
  centreRow: number,
  centreCol: number,
  dRow: number,
  dCol: number,
  radiusCells: number,
  spacingM: number,
): { hillHeightM: number; hillHalfWidthM: number } {
  const rows = points.length;
  const cols = points[0]?.length ?? 0;
  const centreElev = points[centreRow]![centreCol]!.elevationM;

  const elevations: number[] = [];
  const distances: number[] = [];

  for (let step = 1; step <= radiusCells; step++) {
    const r = centreRow + step * dRow;
    const c = centreCol + step * dCol;

    if (r < 0 || r >= rows || c < 0 || c >= cols) break;

    elevations.push(points[r]![c]!.elevationM);
    const diagFactor = dRow !== 0 && dCol !== 0 ? Math.SQRT2 : 1;
    distances.push(step * spacingM * diagFactor);
  }

  if (elevations.length === 0) {
    return { hillHeightM: 0, hillHalfWidthM: 0 };
  }

  // Average surrounding elevation in this direction
  const avgSurrounding = elevations.reduce((sum, e) => sum + e, 0) / elevations.length;

  // Hill height: positive = above surroundings (ridge), negative = below (valley)
  const hillHeightM = centreElev - avgSurrounding;

  // Find half-width: distance to where elevation is halfway between centre and average
  const halfElev = centreElev - hillHeightM / 2;
  let halfWidthM = distances[distances.length - 1]!; // default to max distance

  for (let i = 0; i < elevations.length; i++) {
    if (
      (hillHeightM > 0 && elevations[i]! <= halfElev) ||
      (hillHeightM < 0 && elevations[i]! >= halfElev)
    ) {
      halfWidthM = distances[i]!;
      break;
    }
  }

  return {
    hillHeightM,
    hillHalfWidthM: halfWidthM,
  };
}
