import type { LatLng } from '../types/analysis.js';
import type { SiteBoundary, BoundingBox } from '../types/site.js';
import type { ElevationGrid, ElevationGridPoint } from '../types/terrain.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { createCache } from '../utils/cache.js';
import { fetchWithRetry } from '../utils/fetch.js';

const gridCache = createCache<ElevationGrid>(24 * 60 * 60 * 1000);

interface OpenElevationResponse {
  results: Array<{
    latitude: number;
    longitude: number;
    elevation: number;
  }>;
}

/**
 * Fetch a high-resolution elevation grid across a site boundary.
 *
 * @param boundary - Site boundary defining the area
 * @param spacingM - Grid spacing in metres (default: auto-selected based on area)
 * @returns Grid of elevation values
 */
export async function fetchElevationGrid(
  boundary: SiteBoundary,
  spacingM?: number,
  signal?: AbortSignal,
): Promise<Result<ElevationGrid, ScoringError>> {
  const spacing = spacingM ?? (boundary.areaSqKm < 5 ? 50 : 100);

  const cacheKey = `grid:${boundary.id}:${spacing}`;
  const cached = gridCache.get(cacheKey);
  if (cached) return ok(cached);

  const bb = boundary.boundingBox;
  const gridPoints = generateGridCoordinates(bb, spacing);

  if (gridPoints.length === 0) {
    return err(
      scoringError(
        ScoringErrorCode.InvalidCoordinate,
        'No grid points generated for the given boundary',
      ),
    );
  }

  const flatPoints = gridPoints.flat();

  // Fetch elevation data in batches of 100 (API limit)
  const batchSize = 100;
  const allResults: ElevationGridPoint[] = [];

  for (let i = 0; i < flatPoints.length; i += batchSize) {
    const batch = flatPoints.slice(i, i + batchSize);
    const locationsParam = batch.map((p) => `${p.lat},${p.lng}`).join('|');
    const url = `https://api.open-elevation.com/api/v1/lookup?locations=${locationsParam}`;

    const result = await fetchWithRetry(url, signal ? { signal } : {});
    if (!result.ok) {
      return err(
        scoringError(
          ScoringErrorCode.DataFetchFailed,
          `Elevation grid fetch failed at batch ${Math.floor(i / batchSize) + 1}`,
          result.error,
        ),
      );
    }

    let data: OpenElevationResponse;
    try {
      data = (await result.value.json()) as OpenElevationResponse;
    } catch (cause) {
      return err(
        scoringError(
          ScoringErrorCode.DataFetchFailed,
          'Failed to parse elevation grid response',
          cause,
        ),
      );
    }

    if (!data.results || data.results.length !== batch.length) {
      return err(
        scoringError(
          ScoringErrorCode.DataFetchFailed,
          `Elevation grid returned ${data.results?.length ?? 0} points, expected ${batch.length}`,
        ),
      );
    }

    for (const r of data.results) {
      allResults.push({
        lat: r.latitude,
        lng: r.longitude,
        elevationM: r.elevation,
      });
    }

    // Rate limit: 1 second between batches
    if (i + batchSize < flatPoints.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Reshape flat results back into 2D grid
  const rows = gridPoints.length;
  const cols = gridPoints[0]?.length ?? 0;
  const points: ElevationGridPoint[][] = [];
  let idx = 0;
  let minElev = Infinity;
  let maxElev = -Infinity;

  for (let r = 0; r < rows; r++) {
    const row: ElevationGridPoint[] = [];
    for (let c = 0; c < cols; c++) {
      const pt = allResults[idx]!;
      if (pt.elevationM < minElev) minElev = pt.elevationM;
      if (pt.elevationM > maxElev) maxElev = pt.elevationM;
      row.push(pt);
      idx++;
    }
    points.push(row);
  }

  const grid: ElevationGrid = {
    points,
    spacingM: spacing,
    rows,
    cols,
    minElevationM: minElev,
    maxElevationM: maxElev,
  };

  gridCache.set(cacheKey, grid);
  return ok(grid);
}

/**
 * Generate a regular grid of coordinates within a bounding box.
 * Returns a 2D array [rows][cols] of LatLng coordinates.
 */
export function generateGridCoordinates(bb: BoundingBox, spacingM: number): LatLng[][] {
  // Approximate degree per metre at the midpoint latitude
  const midLat = (bb.north + bb.south) / 2;
  const latDegPerM = 1 / 111320;
  const lngDegPerM = 1 / (111320 * Math.cos((midLat * Math.PI) / 180));

  const latStep = spacingM * latDegPerM;
  const lngStep = spacingM * lngDegPerM;

  const grid: LatLng[][] = [];

  for (let lat = bb.south; lat <= bb.north; lat += latStep) {
    const row: LatLng[] = [];
    for (let lng = bb.west; lng <= bb.east; lng += lngStep) {
      row.push({ lat, lng });
    }
    if (row.length > 0) {
      grid.push(row);
    }
  }

  return grid;
}

/**
 * Create an elevation grid from pre-existing elevation data (for testing or offline use).
 */
export function createElevationGrid(
  points: ElevationGridPoint[][],
  spacingM: number,
): ElevationGrid {
  let minElev = Infinity;
  let maxElev = -Infinity;

  for (const row of points) {
    for (const pt of row) {
      if (pt.elevationM < minElev) minElev = pt.elevationM;
      if (pt.elevationM > maxElev) maxElev = pt.elevationM;
    }
  }

  return {
    points,
    spacingM,
    rows: points.length,
    cols: points[0]?.length ?? 0,
    minElevationM: minElev === Infinity ? 0 : minElev,
    maxElevationM: maxElev === -Infinity ? 0 : maxElev,
  };
}

export function clearElevationGridCache(): void {
  gridCache.clear();
}
