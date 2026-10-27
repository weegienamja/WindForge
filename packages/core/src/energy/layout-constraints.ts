import type { LatLng } from '../types/analysis.js';
import type { ExclusionZone } from '../types/constraints.js';
import type { SiteBoundary } from '../types/site.js';
import { pointInPolygonWithHoles } from '../utils/feature-geometry.js';
import { distanceKm } from '../utils/geo.js';
import { isPointInPolygon } from '../utils/geometry.js';

export function isValidPosition(
  point: LatLng,
  boundary: SiteBoundary,
  exclusionZones: ExclusionZone[],
): boolean {
  if (!isPointInPolygon(point, boundary.polygon)) return false;
  return !exclusionZones.some((zone) => pointInPolygonWithHoles(point, zone.polygon, zone.holes));
}

export function satisfiesSpacing(
  candidate: LatLng,
  positions: LatLng[],
  movingIndex: number,
  minSpacingKm: number,
): boolean {
  return positions.every(
    (position, index) => index === movingIndex || distanceKm(candidate, position) >= minSpacingKm,
  );
}

export function validCoordinate(point: LatLng): boolean {
  return (
    Number.isFinite(point.lat) &&
    Math.abs(point.lat) <= 90 &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lng) <= 180
  );
}

export function validLayoutGeometry(boundary: SiteBoundary, zones: ExclusionZone[]): boolean {
  const rings = [
    boundary.polygon,
    ...zones.flatMap((zone) => [zone.polygon, ...(zone.holes ?? [])]),
  ];
  return rings.every(
    (ring) =>
      ring.every(validCoordinate) && new Set(ring.map((p) => `${p.lat},${p.lng}`)).size >= 3,
  );
}

export function integerInRange(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
