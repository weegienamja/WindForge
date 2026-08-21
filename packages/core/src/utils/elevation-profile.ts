// Elevation profile utility
//
// Fetches elevation points along a line between two coordinates
// for use in terrain screening (noise) and viewshed calculations.

import type { LatLng } from '../types/analysis.js';
import type { ElevationProfile, ElevationProfilePoint } from '../types/noise.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { fetchWithRetry } from './fetch.js';

const EARTH_RADIUS_M = 6371000;

/**
 * Calculate distance between two coordinates in metres.
 */
function haversineDistanceM(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat ** 2 + Math.cos(lat1) * Math.cos(lat2) * sinDLng ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Interpolate coordinates along a line between two points.
 *
 * @param from - Start coordinate
 * @param to - End coordinate
 * @param numPoints - Number of points (including start and end)
 * @returns Array of interpolated coordinates
 */
export function interpolateCoordinates(from: LatLng, to: LatLng, numPoints: number): LatLng[] {
  if (numPoints < 2) return [from];

  const points: LatLng[] = [];
  for (let i = 0; i < numPoints; i++) {
    const fraction = i / (numPoints - 1);
    points.push({
      lat: from.lat + fraction * (to.lat - from.lat),
      lng: from.lng + fraction * (to.lng - from.lng),
    });
  }

  return points;
}

/**
 * Fetch elevation profile along a line between two coordinates.
 *
 * Uses the Open-Elevation API to get elevation at interpolated points.
 *
 * @param from - Start coordinate
 * @param to - End coordinate
 * @param numPoints - Number of profile points (default: 20)
 * @param signal - Optional abort signal
 */
export async function fetchElevationProfile(
  from: LatLng,
  to: LatLng,
  numPoints: number = 20,
  signal?: AbortSignal,
): Promise<Result<ElevationProfile, ScoringError>> {
  const points = interpolateCoordinates(from, to, Math.max(2, numPoints));
  const totalDistM = haversineDistanceM(from, to);

  // Batch request to Open-Elevation API
  // API accepts pipe-delimited coordinates
  const locationsParam = points.map((p) => `${p.lat},${p.lng}`).join('|');
  const url = `https://api.open-elevation.com/api/v1/lookup?locations=${locationsParam}`;

  const result = await fetchWithRetry(url, signal ? { signal } : {});
  if (!result.ok) {
    return err(
      scoringError(
        ScoringErrorCode.DataFetchFailed,
        `Failed to fetch elevation profile: ${result.error.message}`,
      ),
    );
  }

  let elevations: Array<{ latitude: number; longitude: number; elevation: number }>;
  try {
    const data = (await result.value.json()) as {
      results: Array<{ latitude: number; longitude: number; elevation: number }>;
    };
    elevations = data.results;
  } catch {
    return err(
      scoringError(ScoringErrorCode.DataFetchFailed, 'Invalid elevation profile response format'),
    );
  }

  if (!elevations || elevations.length !== points.length) {
    return err(
      scoringError(
        ScoringErrorCode.DataFetchFailed,
        `Expected ${points.length} elevation points, got ${elevations?.length ?? 0}`,
      ),
    );
  }

  const profilePoints: ElevationProfilePoint[] = points.map((coord, i) => ({
    distanceM: (i / Math.max(1, points.length - 1)) * totalDistM,
    elevationM: elevations[i]!.elevation,
    coord,
  }));

  return ok({
    points: profilePoints,
    fromCoord: from,
    toCoord: to,
    totalDistanceM: totalDistM,
  });
}

/**
 * Create an elevation profile from pre-existing elevation data
 * (when you already have the elevations and don't need an API call).
 */
export function createElevationProfile(
  from: LatLng,
  to: LatLng,
  elevations: number[],
): ElevationProfile {
  const totalDistM = haversineDistanceM(from, to);
  const points = interpolateCoordinates(from, to, elevations.length);

  return {
    points: points.map((coord, i) => ({
      distanceM: (i / Math.max(1, elevations.length - 1)) * totalDistM,
      elevationM: elevations[i]!,
      coord,
    })),
    fromCoord: from,
    toCoord: to,
    totalDistanceM: totalDistM,
  };
}
