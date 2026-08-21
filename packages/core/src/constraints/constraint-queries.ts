import type { LatLng } from '../types/analysis.js';
import type { SiteBoundary } from '../types/site.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { createCache } from '../utils/cache.js';
import { expandBoundingBox } from '../utils/geometry.js';
import { getMaxSetbackKm } from './constraint-definitions.js';
import {
  osmElementToGeometry,
  representativeLocation,
  type OsmGeometryMember,
  type OsmGeometryPoint,
} from '../utils/feature-geometry.js';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
] as const;
const OVERPASS_TIMEOUT_S = 30;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ConstraintElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: OsmGeometryPoint[];
  members?: OsmGeometryMember[];
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
  way["power"="line"]["voltage"~"(^|;)[1-9][0-9]{5,}($|;)"](${bbox});
  way["natural"="water"](${bbox});
  way["waterway"~"river|canal"](${bbox});
  relation["natural"="water"](${bbox});
  node["generator:source"="wind"](${bbox});
  way["generator:source"="wind"](${bbox});
  node["power"="substation"](${bbox});
  way["power"="substation"](${bbox});
);
out body geom;`;

  let lastError: ScoringError | null = null;
  for (let attempt = 0; attempt < OVERPASS_ENDPOINTS.length; attempt++) {
    if (signal?.aborted) {
      return err(scoringError(ScoringErrorCode.Timeout, 'Overpass constraint query cancelled'));
    }
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
    const result = await requestConstraintData(OVERPASS_ENDPOINTS[attempt]!, query, signal);
    if (result.ok) {
      constraintCache.set(cacheKey, result.value);
      return result;
    }
    lastError = result.error;
    if (!result.error.cause || result.error.code === ScoringErrorCode.ParseError) break;
  }

  return err(
    lastError ?? scoringError(ScoringErrorCode.DataFetchFailed, 'Overpass constraint query failed'),
  );
}

async function requestConstraintData(
  endpoint: string,
  query: string,
  signal?: AbortSignal,
): Promise<Result<ConstraintOverpassResponse, ScoringError>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), (OVERPASS_TIMEOUT_S + 5) * 1000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'WindForge/0.3 (+https://github.com/weegienamja/WindForge)',
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const transient = response.status === 429 || response.status >= 500;
      return err(
        scoringError(
          ScoringErrorCode.DataFetchFailed,
          `Overpass constraint query HTTP ${response.status}`,
          transient ? new Error('transient upstream response') : undefined,
        ),
      );
    }

    const data: unknown = await response.json();
    if (!isConstraintResponse(data)) {
      return err(
        scoringError(
          ScoringErrorCode.ParseError,
          'Overpass returned an invalid constraint payload',
        ),
      );
    }
    return ok(data);
  } catch (cause) {
    const aborted = controller.signal.aborted;
    return err(
      scoringError(
        aborted ? ScoringErrorCode.Timeout : ScoringErrorCode.DataFetchFailed,
        aborted ? 'Overpass constraint query timed out' : 'Overpass constraint query failed',
        cause,
      ),
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

function isConstraintResponse(value: unknown): value is ConstraintOverpassResponse {
  return Boolean(
    value && typeof value === 'object' && Array.isArray((value as { elements?: unknown }).elements),
  );
}

/**
 * Get the coordinate of an Overpass element.
 */
export function getElementCoordinate(el: ConstraintElement): LatLng | null {
  const geometry = osmElementToGeometry(el);
  return geometry ? representativeLocation(geometry) : null;
}

export function clearConstraintCache(): void {
  constraintCache.clear();
}
