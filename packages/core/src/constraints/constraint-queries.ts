import {
  OVERPASS_TIMEOUT_S,
  type OverpassElement,
  type OverpassResponse,
  queryOverpass,
} from '../datasources/overpass-client.js';
import type { LatLng } from '../types/analysis.js';
import type { ScoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok } from '../types/result.js';
import type { SiteBoundary } from '../types/site.js';
import { createCache } from '../utils/cache.js';
import { osmElementToGeometry, representativeLocation } from '../utils/feature-geometry.js';
import { expandBoundingBox } from '../utils/geometry.js';
import { getMaxSetbackKm } from './constraint-definitions.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type ConstraintElement = OverpassElement;
export type ConstraintOverpassResponse = OverpassResponse;

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

  const result = await queryOverpass(query, signal);
  if (result.ok) constraintCache.set(cacheKey, result.value);
  return result;
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
