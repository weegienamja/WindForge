import type { LatLng } from '../types/analysis.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { createCache } from '../utils/cache.js';
import { distanceKm } from '../utils/geo.js';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const OVERPASS_TIMEOUT_S = 20;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// --- Public result types ---

export interface GridInfrastructure {
  nearestLineDistanceKm: number;
  nearestSubstationDistanceKm: number;
  lineCount: number;
  substationCount: number;
  searchRadiusKm: number;
}

export interface LandUseResult {
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

const gridCache = createCache<GridInfrastructure>(CACHE_TTL_MS);
const landUseCache = createCache<LandUseResult>(CACHE_TTL_MS);
const roadCache = createCache<RoadAccess>(CACHE_TTL_MS);
const windFarmCache = createCache<NearbyWindFarm[]>(CACHE_TTL_MS);

function cacheKey(coord: LatLng, prefix: string): string {
  return `${prefix}:${coord.lat.toFixed(4)},${coord.lng.toFixed(4)}`;
}

// --- Bounding box helper ---

function bboxFromRadius(center: LatLng, radiusKm: number): { south: number; west: number; north: number; east: number } {
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

// --- Raw Overpass query execution ---

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

async function runOverpassQuery(query: string, signal?: AbortSignal): Promise<Result<OverpassResponse, ScoringError>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), (OVERPASS_TIMEOUT_S + 5) * 1000);
  // If an external signal aborts, propagate to our controller
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
      return err(scoringError(ScoringErrorCode.DataFetchFailed, `Overpass API HTTP ${response.status}`));
    }

    const data = (await response.json()) as OverpassResponse;
    return ok(data);
  } catch (cause) {
    const isAbort = cause instanceof DOMException && cause.name === 'AbortError';
    return err(
      scoringError(
        isAbort ? ScoringErrorCode.Timeout : ScoringErrorCode.DataFetchFailed,
        isAbort ? 'Overpass API request timed out' : 'Overpass API request failed',
        cause,
      ),
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function runOverpassWithRetry(query: string, signal?: AbortSignal): Promise<Result<OverpassResponse, ScoringError>> {
  const first = await runOverpassQuery(query, signal);
  if (first.ok) return first;
  // Single retry after 5s (Overpass rate-limits aggressively)
  await new Promise((r) => setTimeout(r, 5000));
  return runOverpassQuery(query, signal);
}

function getElementCoord(el: OverpassElement): LatLng | null {
  if (el.lat !== undefined && el.lon !== undefined) return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
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
  way["power"="line"]["voltage"~"^[1-9][0-9]{5,}$"](${bbox});
  node["power"="substation"](${bbox});
  way["power"="substation"](${bbox});
);
out center;`;

  const result = await runOverpassWithRetry(query, signal);
  if (!result.ok) return result;

  const elements = result.value.elements;
  let nearestLineDistanceKm = Number.POSITIVE_INFINITY;
  let nearestSubstationDistanceKm = Number.POSITIVE_INFINITY;
  let lineCount = 0;
  let substationCount = 0;

  for (const el of elements) {
    const coord = getElementCoord(el);
    if (!coord) continue;
    const dist = distanceKm(center, coord);

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

  return ok({ nearestLineDistanceKm, nearestSubstationDistanceKm, lineCount, substationCount, searchRadiusKm: radiusKm });
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
out center;`;

  const result = await runOverpassWithRetry(query, signal);
  if (!result.ok) return result;

  const hardConstraints: LandUseConstraint[] = [];
  const softConstraints: LandUseSoftConstraint[] = [];
  const positiveIndicators: string[] = [];

  const positiveLandUse = new Set(['farmland', 'meadow', 'grass']);
  const positiveNatural = new Set(['heath', 'scrub']);

  for (const el of result.value.elements) {
    const coord = getElementCoord(el);
    const dist = coord ? distanceKm(coordinate, coord) : 0;
    const tags = el.tags ?? {};

    // Hard constraints
    if (tags.leisure === 'nature_reserve') {
      hardConstraints.push({ type: 'nature_reserve', description: 'Nature reserve detected at site' });
    } else if (tags.boundary === 'protected_area') {
      hardConstraints.push({ type: 'protected_area', description: 'Protected area designation at site' });
    } else if (tags.landuse === 'military') {
      hardConstraints.push({ type: 'military', description: 'Military land use at site' });
    } else if (tags.aeroway) {
      hardConstraints.push({ type: 'aeroway', description: `Aeroway infrastructure (${tags.aeroway}) near site` });
    } else if (tags.landuse === 'cemetery') {
      hardConstraints.push({ type: 'cemetery', description: 'Cemetery at site' });
    }
    // Soft constraints
    else if (tags.landuse === 'residential' && dist < 0.5) {
      softConstraints.push({ type: 'residential', distanceKm: dist, description: `Residential area ${(dist * 1000).toFixed(0)}m away (noise buffer concern)` });
    } else if (tags.natural === 'water' || tags.waterway) {
      softConstraints.push({ type: 'water', distanceKm: dist, description: 'Water body nearby (complicates foundation work)' });
    } else if (tags.landuse === 'forest') {
      softConstraints.push({ type: 'forest', distanceKm: dist, description: 'Forest (tree clearing required)' });
    }
    // Positive indicators
    else if (positiveLandUse.has(tags.landuse ?? '')) {
      const label = tags.landuse === 'farmland' ? 'Farmland' : tags.landuse === 'meadow' ? 'Meadow' : 'Grassland';
      if (!positiveIndicators.includes(label)) positiveIndicators.push(label);
    } else if (positiveNatural.has(tags.natural ?? '')) {
      const label = tags.natural === 'heath' ? 'Heathland' : 'Scrubland';
      if (!positiveIndicators.includes(label)) positiveIndicators.push(label);
    }
  }

  const data: LandUseResult = { hardConstraints, softConstraints, positiveIndicators, searchRadiusKm };
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
out center;`;

  const result = await runOverpassWithRetry(query, signal);
  if (!result.ok) return result;

  let nearestMajorRoadDistanceKm = Number.POSITIVE_INFINITY;
  let nearestMajorRoadType = '';
  let nearestSecondaryRoadDistanceKm = Number.POSITIVE_INFINITY;
  let secondaryRoadCount = 0;
  let bestRoadCategory: 'primary' | 'secondary' | 'minor' | 'none' = 'none';

  const majorHighways = new Set(['motorway', 'trunk', 'primary']);
  const secondaryHighways = new Set(['secondary', 'tertiary']);

  for (const el of result.value.elements) {
    const coord = getElementCoord(el);
    if (!coord) continue;
    const dist = distanceKm(coordinate, coord);
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
      if (bestRoadCategory === 'none' || bestRoadCategory === 'minor') bestRoadCategory = 'secondary';
    } else {
      if (bestRoadCategory === 'none') bestRoadCategory = 'minor';
    }
  }

  if (nearestMajorRoadDistanceKm === Number.POSITIVE_INFINITY) nearestMajorRoadDistanceKm = -1;
  if (nearestSecondaryRoadDistanceKm === Number.POSITIVE_INFINITY) nearestSecondaryRoadDistanceKm = -1;

  const data: RoadAccess = {
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
out center;`;

  const result = await runOverpassWithRetry(query, signal);
  if (!result.ok) return result;

  const farms: NearbyWindFarm[] = [];
  for (const el of result.value.elements) {
    const coord = getElementCoord(el);
    if (!coord) continue;
    farms.push({ distanceKm: distanceKm(coordinate, coord) });
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
