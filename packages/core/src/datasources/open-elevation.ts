import type { LatLng } from '../types/analysis.js';
import type { ElevationData } from '../types/datasources.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { createCache } from '../utils/cache.js';
import { fetchWithRetry } from '../utils/fetch.js';

const elevationCache = createCache<ElevationData>(60 * 60 * 1000);

interface OpenElevationResponse {
  results: Array<{
    latitude: number;
    longitude: number;
    elevation: number;
  }>;
}

function cacheKey(coord: LatLng): string {
  return `${coord.lat.toFixed(4)},${coord.lng.toFixed(4)}`;
}

export async function fetchElevationData(
  coordinate: LatLng,
  signal?: AbortSignal,
): Promise<Result<ElevationData, ScoringError>> {
  const key = cacheKey(coordinate);
  const cached = elevationCache.get(key);
  if (cached) {
    return ok(cached);
  }

  // Fetch the main point and 4 nearby points to estimate slope
  const offsetDeg = 0.001; // roughly 100m
  const points = [
    coordinate,
    { lat: coordinate.lat + offsetDeg, lng: coordinate.lng },
    { lat: coordinate.lat - offsetDeg, lng: coordinate.lng },
    { lat: coordinate.lat, lng: coordinate.lng + offsetDeg },
    { lat: coordinate.lat, lng: coordinate.lng - offsetDeg },
  ];

  const locationsParam = points.map((p) => `${p.lat},${p.lng}`).join('|');
  const url = `https://api.open-elevation.com/api/v1/lookup?locations=${locationsParam}`;

  const result = await fetchWithRetry(url, signal ? { signal } : {});
  if (!result.ok) {
    return result;
  }

  let data: OpenElevationResponse;
  try {
    data = (await result.value.json()) as OpenElevationResponse;
  } catch (cause) {
    return err(
      scoringError(
        ScoringErrorCode.DataFetchFailed,
        'Failed to parse Open-Elevation response',
        cause,
      ),
    );
  }

  if (!data.results || data.results.length < 5) {
    return err(
      scoringError(
        ScoringErrorCode.DataFetchFailed,
        'Open-Elevation returned insufficient data points',
      ),
    );
  }

  const centerElevation = data.results[0]!.elevation;
  const northElevation = data.results[1]!.elevation;
  const southElevation = data.results[2]!.elevation;
  const eastElevation = data.results[3]!.elevation;
  const westElevation = data.results[4]!.elevation;

  const distanceM = offsetDeg * 111320; // approximate meters per degree at equator

  const slopeNS = Math.abs(northElevation - southElevation) / (2 * distanceM);
  const slopeEW = Math.abs(eastElevation - westElevation) / (2 * distanceM);
  const slopePercent = Math.sqrt(slopeNS ** 2 + slopeEW ** 2) * 100;

  const dY = northElevation - southElevation;
  const dX = eastElevation - westElevation;
  let aspectDeg = (Math.atan2(dX, dY) * 180) / Math.PI;
  if (aspectDeg < 0) aspectDeg += 360;

  const roughnessClass = estimateRoughnessClass(centerElevation, slopePercent);

  const elevationData: ElevationData = {
    coordinate,
    elevationM: centerElevation,
    slopePercent,
    aspectDeg,
    roughnessClass,
  };

  elevationCache.set(key, elevationData);
  return ok(elevationData);
}

function estimateRoughnessClass(elevationM: number, slopePercent: number): number {
  // Rough estimation based on terrain characteristics
  // Class 0: Water (very flat, near sea level)
  // Class 1: Open terrain (flat, low elevation)
  // Class 2: Agricultural land (moderate)
  // Class 3: Urban/forest (complex terrain)
  if (slopePercent < 1 && elevationM < 10) return 0;
  if (slopePercent < 5 && elevationM < 200) return 1;
  if (slopePercent < 15) return 2;
  return 3;
}

export function clearElevationCache(): void {
  elevationCache.clear();
}
