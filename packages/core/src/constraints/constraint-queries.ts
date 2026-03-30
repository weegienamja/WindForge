import type { LatLng } from '../types/analysis.js';
import type { SiteBoundary } from '../types/site.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { createCache } from '../utils/cache.js';
import { expandBoundingBox } from '../utils/geometry.js';
import { getMaxSetbackKm } from './constraint-definitions.js';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const OVERPASS_TIMEOUT_S = 30;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ConstraintElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface ConstraintOverpassResponse {
  elements: ConstraintElement[];
}

const constraintCache = createCache<ConstraintOverpassResponse>(CACHE_TTL_MS);

function bboxString(bbox: { south: number; west: number; north: number; east: number }): string {
  return `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
}

/**
 * Fetch all constraint-relevant features for a site boundary
 * using a single comprehensive Overpass query.
 */
export async function fetchConstraintData(
  boundary: SiteBoundary,
  signal?: AbortSignal,
): Promise<Result<ConstraintOverpassResponse, ScoringError>> {
  const expandedBbox = expandBoundingBox(boundary.boundingBox, getMaxSetbackKm() + 1);
  const cacheKey = `constraints:${bboxString(expandedBbox)}`;

  const cached = constraintCache.get(cacheKey);
  if (cached) return ok(cached);

  const bbox = bboxString(expandedBbox);

  const query = `[out:json][timeout:${OVERPASS_TIMEOUT_S}];
(
  way["building"="residential"](${bbox});
  way["building"="house"](${bbox});
  way["building"="detached"](${bbox});
  node["building"="residential"](${bbox});
  node["place"~"village|town|city|hamlet"](${bbox});
  way["leisure"="nature_reserve"](${bbox});
  relation["leisure"="nature_reserve"](${bbox});
  way["boundary"="protected_area"](${bbox});
  relation["boundary"="protected_area"](${bbox});
  way["aeroway"~"aerodrome|runway|helipad"](${bbox});
  node["aeroway"~"aerodrome|runway|helipad"](${bbox});
  way["landuse"="military"](${bbox});
  node["historic"~"monument|castle|memorial"](${bbox});
  way["historic"~"monument|castle|memorial"](${bbox});
  node["heritage"](${bbox});
  way["railway"~"rail|light_rail"](${bbox});
  way["highway"~"motorway|trunk"](${bbox});
  way["power"="line"]["voltage"~"^[1-9][0-9]{5,}$"](${bbox});
  way["natural"="water"](${bbox});
  way["waterway"~"river|canal"](${bbox});
  relation["natural"="water"](${bbox});
  node["generator:source"="wind"](${bbox});
  way["generator:source"="wind"](${bbox});
  node["power"="substation"](${bbox});
  way["power"="substation"](${bbox});
);
out center body;`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), (OVERPASS_TIMEOUT_S + 5) * 1000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    if (!response.ok) {
      return err(scoringError(ScoringErrorCode.DataFetchFailed, `Overpass constraint query HTTP ${response.status}`));
    }

    const data = (await response.json()) as ConstraintOverpassResponse;
    constraintCache.set(cacheKey, data);
    return ok(data);
  } catch (cause) {
    const isAbort = cause instanceof DOMException && cause.name === 'AbortError';

    // Single retry after 5s
    if (!isAbort) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const retryResponse = await fetch(OVERPASS_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal: signal ?? AbortSignal.timeout((OVERPASS_TIMEOUT_S + 5) * 1000),
        });
        if (retryResponse.ok) {
          const data = (await retryResponse.json()) as ConstraintOverpassResponse;
          constraintCache.set(cacheKey, data);
          return ok(data);
        }
      } catch {
        // Retry also failed, fall through
      }
    }

    return err(
      scoringError(
        isAbort ? ScoringErrorCode.Timeout : ScoringErrorCode.DataFetchFailed,
        isAbort ? 'Overpass constraint query timed out' : 'Overpass constraint query failed',
        cause,
      ),
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Get the coordinate of an Overpass element.
 */
export function getElementCoordinate(el: ConstraintElement): LatLng | null {
  if (el.lat !== undefined && el.lon !== undefined) return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

export function clearConstraintCache(): void {
  constraintCache.clear();
}
