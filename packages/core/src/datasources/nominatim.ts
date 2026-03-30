import type { LatLng } from '../types/analysis.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { createCache } from '../utils/cache.js';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'WindSiteIntelligence/0.1 (https://jamieblair.co.uk)';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ReverseGeocodeResult {
  countryCode: string; // ISO 3166-1 alpha-2
  country: string;
  region: string;
  displayName: string;
}

const geocodeCache = createCache<ReverseGeocodeResult>(CACHE_TTL_MS);

// Enforce 1 request/second rate limit (Nominatim ToS)
let lastRequestTime = 0;

async function respectRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed));
  }
  lastRequestTime = Date.now();
}

function cacheKey(coord: LatLng): string {
  return `nominatim:${coord.lat.toFixed(4)},${coord.lng.toFixed(4)}`;
}

interface NominatimResponse {
  address?: {
    country_code?: string;
    country?: string;
    state?: string;
    county?: string;
    region?: string;
  };
  display_name?: string;
}

export async function reverseGeocode(
  coordinate: LatLng,
  signal?: AbortSignal,
): Promise<Result<ReverseGeocodeResult, ScoringError>> {
  const key = cacheKey(coordinate);
  const cached = geocodeCache.get(key);
  if (cached) return ok(cached);

  await respectRateLimit();

  const url = `${NOMINATIM_ENDPOINT}?lat=${coordinate.lat}&lon=${coordinate.lng}&format=json&zoom=10`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: signal ?? AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return err(scoringError(ScoringErrorCode.DataFetchFailed, `Nominatim HTTP ${response.status}`));
    }

    const data = (await response.json()) as NominatimResponse;
    const address = data.address;

    const result: ReverseGeocodeResult = {
      countryCode: address?.country_code?.toUpperCase() ?? '',
      country: address?.country ?? '',
      region: address?.state ?? address?.county ?? address?.region ?? '',
      displayName: data.display_name ?? '',
    };

    geocodeCache.set(key, result);
    return ok(result);
  } catch (cause) {
    return err(
      scoringError(ScoringErrorCode.DataFetchFailed, 'Nominatim reverse geocoding failed', cause),
    );
  }
}

export function clearGeocodeCache(): void {
  geocodeCache.clear();
  lastRequestTime = 0;
}
