import type { LatLng } from '../types/analysis.js';
import type { ScoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok } from '../types/result.js';
import { createCache } from '../utils/cache.js';
import { geometryDistanceToPointM, osmElementToGeometry } from '../utils/feature-geometry.js';

import { OVERPASS_TIMEOUT_S, queryOverpass } from './overpass-client.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// --- Public result types ---

export interface GridInfrastructure {
  osmBaseTimestamp?: string;
  nearestLineDistanceKm: number;
  nearestSubstationDistanceKm: number;
  lineCount: number;
  substationCount: number;
  searchRadiusKm: number;
}

export interface LandUseResult {
  osmBaseTimestamp?: string;
  hardConstraints: LandUseConstraint[];
  softConstraints: LandUseSoftConstraint[];
  positiveIndicators: string[];
  searchRadiusKm: number;
}

export interface LandUseConstraint {
  type: string;
  description: string;
}

export interface LandUseSoftConstraint {
  type: string;
  distanceKm: number;
  description: string;
}

export interface RoadAccess {
  osmBaseTimestamp?: string;
  nearestMajorRoadDistanceKm: number;
  nearestMajorRoadType: string;
  nearestSecondaryRoadDistanceKm: number;
  secondaryRoadCount: number;
  bestRoadCategory: 'primary' | 'secondary' | 'minor' | 'none';
  searchRadiusKm: number;
}

export interface NearbyWindFarm {
  distanceKm: number;
}

// --- Caches (24h TTL) ---

// Match grid-scale transmission voltages (>= 100 kV).
// OSM stores voltage as a string and may contain semicolon-separated values
// (e.g. "132000;33000") for combined-circuit lines. The previous regex pinned
// to start/end of string and missed those entries. This pattern matches any
// value of 6+ digits that is either standalone or surrounded by ';'.
export const GRID_VOLTAGE_REGEX = '(^|;)[1-9][0-9]{5,}($|;)';

const gridCache = createCache<GridInfrastructure>(CACHE_TTL_MS);
const landUseCache = createCache<LandUseResult>(CACHE_TTL_MS);
const roadCache = createCache<RoadAccess>(CACHE_TTL_MS);
const windFarmCache = createCache<NearbyWindFarm[]>(CACHE_TTL_MS);

function cacheKey(coord: LatLng, prefix: string): string {
  return `${prefix}:${coord.lat.toFixed(4)},${coord.lng.toFixed(4)}`;
}

// --- Bounding box helper ---

function bboxFromRadius(
  center: LatLng,
  radiusKm: number,
): { south: number; west: number; north: number; east: number } {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  return {
    south: center.lat - latDelta,
    west: center.lng - lngDelta,
    north: center.lat + latDelta,
    east: center.lng + lngDelta,
  };
}

function bboxString(bbox: { south: number; west: number; north: number; east: number }): string {
  return `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
}

// --- Grid infrastructure ---

export async function fetchGridInfrastructure(
  coordinate: LatLng,
  signal?: AbortSignal,
): Promise<Result<GridInfrastructure, ScoringError>> {
  const key = cacheKey(coordinate, 'grid');
  const cached = gridCache.get(key);
  if (cached) return ok(cached);

  let searchRadiusKm = 50;
  let result = await queryGridInfrastructure(coordinate, searchRadiusKm, signal);
  if (!result.ok) return result;

  // Expand to 100km if nothing found
  if (result.value.lineCount === 0 && result.value.substationCount === 0) {
    searchRadiusKm = 100;
    result = await queryGridInfrastructure(coordinate, searchRadiusKm, signal);
    if (!result.ok) return result;
  }

  const data = { ...result.value, searchRadiusKm };
  gridCache.set(key, data);
  return ok(data);
}

async function queryGridInfrastructure(
  center: LatLng,
  radiusKm: number,
  signal?: AbortSignal,
): Promise<Result<GridInfrastructure, ScoringError>> {
  const bbox = bboxString(bboxFromRadius(center, radiusKm));
  const query = `[out:json][timeout:${OVERPASS_TIMEOUT_S}];
(
  way["power"="line"]["voltage"~"${GRID_VOLTAGE_REGEX}"](${bbox});
  node["power"="substation"](${bbox});
  way["power"="substation"](${bbox});
);
out body geom;`;

  const result = await queryOverpass(query, signal);
  if (!result.ok) return result;

  const elements = result.value.elements;
  let nearestLineDistanceKm = Number.POSITIVE_INFINITY;
  let nearestSubstationDistanceKm = Number.POSITIVE_INFINITY;
  let lineCount = 0;
  let substationCount = 0;

  for (const el of elements) {
    const geometry = osmElementToGeometry(el);
    if (!geometry) continue;
    const dist = geometryDistanceToPointM(geometry, center) / 1000;

    if (el.tags?.power === 'line') {
      lineCount++;
      if (dist < nearestLineDistanceKm) nearestLineDistanceKm = dist;
    } else if (el.tags?.power === 'substation') {
      substationCount++;
      if (dist < nearestSubstationDistanceKm) nearestSubstationDistanceKm = dist;
    }
  }

  if (nearestLineDistanceKm === Number.POSITIVE_INFINITY) nearestLineDistanceKm = -1;
  if (nearestSubstationDistanceKm === Number.POSITIVE_INFINITY) nearestSubstationDistanceKm = -1;

  return ok({
    osmBaseTimestamp: result.value.osmBaseTimestamp,
    nearestLineDistanceKm,
    nearestSubstationDistanceKm,
    lineCount,
    substationCount,
    searchRadiusKm: radiusKm,
  });
}

// --- Land use ---

export async function fetchLandUse(
  coordinate: LatLng,
  signal?: AbortSignal,
): Promise<Result<LandUseResult, ScoringError>> {
  const key = cacheKey(coordinate, 'landuse');
  const cached = landUseCache.get(key);
  if (cached) return ok(cached);

  const searchRadiusKm = 2;
  const bbox = bboxString(bboxFromRadius(coordinate, searchRadiusKm));

  const query = `[out:json][timeout:${OVERPASS_TIMEOUT_S}];
(
  node["leisure"="nature_reserve"](${bbox});
  way["leisure"="nature_reserve"](${bbox});
  relation["leisure"="nature_reserve"](${bbox});
  node["boundary"="protected_area"](${bbox});
  way["boundary"="protected_area"](${bbox});
  relation["boundary"="protected_area"](${bbox});
  way["landuse"="military"](${bbox});
  node["aeroway"](${bbox});
  way["aeroway"](${bbox});
  way["landuse"="cemetery"](${bbox});
  way["landuse"="residential"](${bbox});
  node["natural"="water"](${bbox});
  way["natural"="water"](${bbox});
  way["waterway"](${bbox});
  way["landuse"="forest"](${bbox});
  way["landuse"="farmland"](${bbox});
  way["landuse"="meadow"](${bbox});
  way["landuse"="grass"](${bbox});
  node["natural"="heath"](${bbox});
  way["natural"="heath"](${bbox});
  node["natural"="scrub"](${bbox});
  way["natural"="scrub"](${bbox});
);
out body geom;`;

  const result = await queryOverpass(query, signal);
  if (!result.ok) return result;

  const hardConstraints: LandUseConstraint[] = [];
  const softConstraints: LandUseSoftConstraint[] = [];
  const positiveIndicators: string[] = [];

  const positiveLandUse = new Set(['farmland', 'meadow', 'grass']);
  const positiveNatural = new Set(['heath', 'scrub']);

  for (const el of result.value.elements) {
    const geometry = osmElementToGeometry(el);
    if (!geometry) continue;
    const dist = geometryDistanceToPointM(geometry, coordinate) / 1000;
    const tags = el.tags ?? {};

    // Hard constraints
    if (tags.leisure === 'nature_reserve' && dist === 0) {
      hardConstraints.push({
        type: 'nature_reserve',
        description:
          'OpenStreetMap nature-reserve geometry intersects the site point (screening evidence)',
      });
    } else if (tags.boundary === 'protected_area' && dist === 0) {
      hardConstraints.push({
        type: 'protected_area',
        description:
          'OpenStreetMap protected-area geometry intersects the site point; statutory status is unverified',
      });
    } else if (tags.landuse === 'military' && dist === 0) {
      hardConstraints.push({
        type: 'military',
        description: 'OpenStreetMap military-land geometry intersects the site point',
      });
    } else if (tags.aeroway && dist === 0) {
      hardConstraints.push({
        type: 'aeroway',
        description: `OpenStreetMap aeroway geometry (${tags.aeroway}) intersects the site point`,
      });
    } else if (tags.landuse === 'cemetery' && dist === 0) {
      hardConstraints.push({
        type: 'cemetery',
        description: 'OpenStreetMap cemetery geometry intersects the site point',
      });
    }
    // Soft constraints
    else if (tags.landuse === 'residential' && dist < 0.5) {
      softConstraints.push({
        type: 'residential',
        distanceKm: dist,
        description: `Residential area ${(dist * 1000).toFixed(0)}m away (noise buffer concern)`,
      });
    } else if (tags.natural === 'water' || tags.waterway) {
      softConstraints.push({
        type: 'water',
        distanceKm: dist,
        description: 'Water body nearby (complicates foundation work)',
      });
    } else if (tags.landuse === 'forest') {
      softConstraints.push({
        type: 'forest',
        distanceKm: dist,
        description: 'Forest (tree clearing required)',
      });
    }
    // Positive indicators
    else if (positiveLandUse.has(tags.landuse ?? '') && dist === 0) {
      const label =
        tags.landuse === 'farmland'
          ? 'Farmland'
          : tags.landuse === 'meadow'
            ? 'Meadow'
            : 'Grassland';
      if (!positiveIndicators.includes(label)) positiveIndicators.push(label);
    } else if (positiveNatural.has(tags.natural ?? '') && dist === 0) {
      const label = tags.natural === 'heath' ? 'Heathland' : 'Scrubland';
      if (!positiveIndicators.includes(label)) positiveIndicators.push(label);
    }
  }

  const data: LandUseResult = {
    osmBaseTimestamp: result.value.osmBaseTimestamp,
    hardConstraints,
    softConstraints,
    positiveIndicators,
    searchRadiusKm,
  };
  landUseCache.set(key, data);
  return ok(data);
}

// --- Road access ---

export async function fetchRoadAccess(
  coordinate: LatLng,
  signal?: AbortSignal,
): Promise<Result<RoadAccess, ScoringError>> {
  const key = cacheKey(coordinate, 'roads');
  const cached = roadCache.get(key);
  if (cached) return ok(cached);

  const searchRadiusKm = 5;
  const bbox = bboxString(bboxFromRadius(coordinate, searchRadiusKm));

  const query = `[out:json][timeout:${OVERPASS_TIMEOUT_S}];
(
  way["highway"~"^(motorway|trunk|primary)$"](${bbox});
  way["highway"~"^(secondary|tertiary)$"](${bbox});
  way["highway"~"^(unclassified|track)$"](${bbox});
);
out body geom;`;

  const result = await queryOverpass(query, signal);
  if (!result.ok) return result;

  let nearestMajorRoadDistanceKm = Number.POSITIVE_INFINITY;
  let nearestMajorRoadType = '';
  let nearestSecondaryRoadDistanceKm = Number.POSITIVE_INFINITY;
  let secondaryRoadCount = 0;
  let bestRoadCategory: 'primary' | 'secondary' | 'minor' | 'none' = 'none';

  const majorHighways = new Set(['motorway', 'trunk', 'primary']);
  const secondaryHighways = new Set(['secondary', 'tertiary']);

  for (const el of result.value.elements) {
    const geometry = osmElementToGeometry(el);
    if (!geometry) continue;
    const dist = geometryDistanceToPointM(geometry, coordinate) / 1000;
    const highway = el.tags?.highway ?? '';

    if (majorHighways.has(highway)) {
      if (dist < nearestMajorRoadDistanceKm) {
        nearestMajorRoadDistanceKm = dist;
        nearestMajorRoadType = highway;
      }
      if (bestRoadCategory !== 'primary') bestRoadCategory = 'primary';
    } else if (secondaryHighways.has(highway)) {
      secondaryRoadCount++;
      if (dist < nearestSecondaryRoadDistanceKm) {
        nearestSecondaryRoadDistanceKm = dist;
      }
      if (bestRoadCategory === 'none' || bestRoadCategory === 'minor')
        bestRoadCategory = 'secondary';
    } else {
      if (bestRoadCategory === 'none') bestRoadCategory = 'minor';
    }
  }

  if (nearestMajorRoadDistanceKm === Number.POSITIVE_INFINITY) nearestMajorRoadDistanceKm = -1;
  if (nearestSecondaryRoadDistanceKm === Number.POSITIVE_INFINITY)
    nearestSecondaryRoadDistanceKm = -1;

  const data: RoadAccess = {
    osmBaseTimestamp: result.value.osmBaseTimestamp,
    nearestMajorRoadDistanceKm,
    nearestMajorRoadType,
    nearestSecondaryRoadDistanceKm,
    secondaryRoadCount,
    bestRoadCategory,
    searchRadiusKm,
  };
  roadCache.set(key, data);
  return ok(data);
}

// --- Nearby wind farms ---

export async function fetchNearbyWindFarms(
  coordinate: LatLng,
  signal?: AbortSignal,
): Promise<Result<NearbyWindFarm[], ScoringError>> {
  const key = cacheKey(coordinate, 'windfarms');
  const cached = windFarmCache.get(key);
  if (cached) return ok(cached);

  const radiusKm = 20;
  const bbox = bboxString(bboxFromRadius(coordinate, radiusKm));

  const query = `[out:json][timeout:${OVERPASS_TIMEOUT_S}];
(
  node["generator:source"="wind"](${bbox});
  way["generator:source"="wind"](${bbox});
  node["power"="generator"]["generator:source"="wind"](${bbox});
);
out body geom;`;

  const result = await queryOverpass(query, signal);
  if (!result.ok) return result;

  const farms: NearbyWindFarm[] = [];
  for (const el of result.value.elements) {
    const geometry = osmElementToGeometry(el);
    if (!geometry) continue;
    farms.push({ distanceKm: geometryDistanceToPointM(geometry, coordinate) / 1000 });
  }
  farms.sort((a, b) => a.distanceKm - b.distanceKm);

  windFarmCache.set(key, farms);
  return ok(farms);
}

// --- Cache clearing ---

export function clearOverpassCaches(): void {
  gridCache.clear();
  landUseCache.clear();
  roadCache.clear();
  windFarmCache.clear();
}
