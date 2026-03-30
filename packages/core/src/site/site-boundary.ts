import type { LatLng } from '../types/analysis.js';
import type { SiteBoundary } from '../types/site.js';
import type { Result } from '../types/result.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import { ok, err } from '../types/result.js';
import {
  polygonAreaSqKm,
  polygonCentroid,
  computeBoundingBox,
  generateGridWithinPolygon,
} from '../utils/geometry.js';

let boundaryCounter = 0;

/**
 * Create a SiteBoundary from a polygon of coordinates.
 */
export function createBoundary(polygon: LatLng[], name?: string): SiteBoundary {
  boundaryCounter++;
  const areaSqKm = polygonAreaSqKm(polygon);
  const centroid = polygonCentroid(polygon);
  const boundingBox = computeBoundingBox(polygon);

  return {
    id: `site-${boundaryCounter}-${Date.now()}`,
    name: name ?? `Site ${boundaryCounter}`,
    polygon,
    areaSqKm,
    centroid,
    boundingBox,
  };
}

/**
 * Generate a grid of sample points within a site boundary.
 * Default spacing: 0.5km for sites under 10 sq km, 1km for larger sites.
 */
export function generateSampleGrid(boundary: SiteBoundary, spacingKm?: number): LatLng[] {
  const spacing = spacingKm ?? (boundary.areaSqKm < 10 ? 0.5 : 1.0);
  return generateGridWithinPolygon(boundary.polygon, spacing);
}

/**
 * Parse a GeoJSON string into a SiteBoundary.
 * Accepts Feature or FeatureCollection with Polygon geometry.
 */
export function parseBoundaryFromGeoJSON(geojson: string): Result<SiteBoundary, ScoringError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(geojson);
  } catch {
    return err(scoringError(ScoringErrorCode.Unknown, 'Invalid JSON'));
  }

  const obj = parsed as Record<string, unknown>;
  if (!obj || typeof obj !== 'object') {
    return err(scoringError(ScoringErrorCode.Unknown, 'GeoJSON must be an object'));
  }

  let geometry: Record<string, unknown> | undefined;
  let featureName: string | undefined;

  if (obj.type === 'FeatureCollection') {
    const features = obj.features as Array<Record<string, unknown>> | undefined;
    if (!features || features.length === 0) {
      return err(scoringError(ScoringErrorCode.Unknown, 'FeatureCollection has no features'));
    }
    const feature = features[0]!;
    geometry = feature.geometry as Record<string, unknown> | undefined;
    const props = feature.properties as Record<string, unknown> | undefined;
    featureName = props?.name as string | undefined;
  } else if (obj.type === 'Feature') {
    geometry = obj.geometry as Record<string, unknown> | undefined;
    const props = obj.properties as Record<string, unknown> | undefined;
    featureName = props?.name as string | undefined;
  } else if (obj.type === 'Polygon') {
    geometry = obj;
  } else {
    return err(scoringError(ScoringErrorCode.Unknown, 'Unsupported GeoJSON type'));
  }

  if (!geometry || geometry.type !== 'Polygon') {
    return err(scoringError(ScoringErrorCode.Unknown, 'Geometry must be a Polygon'));
  }

  const coordinates = geometry.coordinates as number[][][] | undefined;
  if (!coordinates || coordinates.length === 0 || !coordinates[0] || coordinates[0].length < 3) {
    return err(scoringError(ScoringErrorCode.Unknown, 'Polygon must have at least 3 coordinates'));
  }

  // GeoJSON uses [lng, lat] order
  const polygon: LatLng[] = coordinates[0].map((coord) => ({
    lat: coord[1]!,
    lng: coord[0]!,
  }));

  // Remove closing point if it duplicates the first
  if (
    polygon.length > 1 &&
    polygon[0]!.lat === polygon[polygon.length - 1]!.lat &&
    polygon[0]!.lng === polygon[polygon.length - 1]!.lng
  ) {
    polygon.pop();
  }

  return ok(createBoundary(polygon, featureName));
}

/**
 * Parse a KML string into a SiteBoundary.
 * Basic KML polygon extraction.
 */
export function parseBoundaryFromKML(kml: string): Result<SiteBoundary, ScoringError> {
  // Extract <coordinates> content from KML
  const coordsMatch = kml.match(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i);
  if (!coordsMatch || !coordsMatch[1]) {
    return err(scoringError(ScoringErrorCode.Unknown, 'No <coordinates> element found in KML'));
  }

  const coordsText = coordsMatch[1].trim();
  const pointStrings = coordsText.split(/\s+/).filter((s) => s.length > 0);

  if (pointStrings.length < 3) {
    return err(scoringError(ScoringErrorCode.Unknown, 'KML polygon must have at least 3 coordinates'));
  }

  const polygon: LatLng[] = [];
  for (const ps of pointStrings) {
    const parts = ps.split(',');
    if (parts.length < 2) continue;
    const lng = Number.parseFloat(parts[0]!);
    const lat = Number.parseFloat(parts[1]!);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    polygon.push({ lat, lng });
  }

  if (polygon.length < 3) {
    return err(scoringError(ScoringErrorCode.Unknown, 'KML polygon has fewer than 3 valid coordinates'));
  }

  // Remove closing point if it duplicates the first
  if (
    polygon.length > 1 &&
    polygon[0]!.lat === polygon[polygon.length - 1]!.lat &&
    polygon[0]!.lng === polygon[polygon.length - 1]!.lng
  ) {
    polygon.pop();
  }

  // Try to extract name
  const nameMatch = kml.match(/<name>([\s\S]*?)<\/name>/i);
  const name = nameMatch?.[1]?.trim();

  return ok(createBoundary(polygon, name));
}

export { isPointInPolygon } from '../utils/geometry.js';
