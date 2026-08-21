// Noise contour grid generator
//
// Computes predicted noise levels on a rectangular grid surrounding a turbine layout.
// Output is suitable for rendering as an iso-line heatmap overlay.

import type { LatLng } from '../types/analysis.js';
import type { NoiseContourGrid, NoiseContourCell, NoiseOptions } from '../types/noise.js';
import { calculateNoiseAtReceptor } from './noise-propagation.js';

/** Standard contour levels for wind turbine noise assessment (dBA) */
const DEFAULT_CONTOUR_LEVELS = [35, 40, 43, 45, 50];

/**
 * Compute noise levels on a grid around a turbine layout.
 *
 * Generates grid points covering the bounding box of all turbines
 * plus a buffer, and calculates the combined noise level at each point.
 *
 * @param turbines - Array of turbine positions and sound power levels
 * @param gridSpacingM - Grid spacing in metres (default: 50)
 * @param bufferM - Buffer around turbines bounding box in metres (default: 3000)
 * @param options - Noise calculation options
 */
export function computeNoiseContours(
  turbines: Array<{ id: number; location: LatLng; soundPowerLevelDba: number }>,
  hubHeightM: number,
  gridSpacingM: number = 50,
  bufferM: number = 3000,
  options: NoiseOptions = {},
): NoiseContourGrid {
  if (turbines.length === 0) {
    return { cells: [], gridSpacingM, minLevelDba: 0, maxLevelDba: 0, contourLevelsDba: [] };
  }

  // Compute bounding box of turbines
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const t of turbines) {
    minLat = Math.min(minLat, t.location.lat);
    maxLat = Math.max(maxLat, t.location.lat);
    minLng = Math.min(minLng, t.location.lng);
    maxLng = Math.max(maxLng, t.location.lng);
  }

  // Convert buffer to degrees (approximate)
  const latBufferDeg = bufferM / 111320;
  const cosLat = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const lngBufferDeg = bufferM / (111320 * cosLat);

  minLat -= latBufferDeg;
  maxLat += latBufferDeg;
  minLng -= lngBufferDeg;
  maxLng += lngBufferDeg;

  // Convert grid spacing to degrees
  const latStepDeg = gridSpacingM / 111320;
  const lngStepDeg = gridSpacingM / (111320 * cosLat);

  const cells: NoiseContourCell[] = [];
  let minLevel = Infinity;
  let maxLevel = -Infinity;

  const turbineInputs = turbines.map((t) => ({ id: t.id, location: t.location }));
  const splArray = turbines.map((t) => t.soundPowerLevelDba);

  for (let lat = minLat; lat <= maxLat; lat += latStepDeg) {
    for (let lng = minLng; lng <= maxLng; lng += lngStepDeg) {
      const receptor: LatLng = { lat, lng };

      const result = calculateNoiseAtReceptor(
        turbineInputs,
        receptor,
        splArray,
        hubHeightM,
        options,
      );

      const level = result.predictedLevelDba;

      // Only include cells above a minimum audible threshold
      if (level >= 25) {
        cells.push({
          lat: Math.round(lat * 100000) / 100000,
          lng: Math.round(lng * 100000) / 100000,
          levelDba: level,
        });

        minLevel = Math.min(minLevel, level);
        maxLevel = Math.max(maxLevel, level);
      }
    }
  }

  // Determine which standard contour levels are crossed
  const contourLevelsDba = DEFAULT_CONTOUR_LEVELS.filter((l) => l >= minLevel && l <= maxLevel);

  return {
    cells,
    gridSpacingM,
    minLevelDba: cells.length > 0 ? Math.round(minLevel * 10) / 10 : 0,
    maxLevelDba: cells.length > 0 ? Math.round(maxLevel * 10) / 10 : 0,
    contourLevelsDba,
  };
}
