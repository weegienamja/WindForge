import type { LatLng } from '../types/analysis.js';
import type { BoundingBox } from '../types/site.js';
import { distanceKm, degreesToRadians } from './geo.js';

const EARTH_RADIUS_KM = 6371;

/**
 * Point-in-polygon using ray casting algorithm.
 * Works correctly with concave polygons.
 */
export function isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;

    if (
      pi.lng > point.lng !== pj.lng > point.lng &&
      point.lat < ((pj.lat - pi.lat) * (point.lng - pi.lng)) / (pj.lng - pi.lng) + pi.lat
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Polygon area using the spherical excess (Shoelace on a sphere).
 * Uses haversine-based approach for accuracy at geographic scales.
 */
export function polygonAreaSqKm(polygon: LatLng[]): number {
  if (polygon.length < 3) return 0;

  // Use the surveyor's formula adapted for lat/lng
  // For polygons that aren't too large, we project to a local flat coordinate system
  // using the centroid as the reference point
  const centroid = polygonCentroid(polygon);
  const cosLat = Math.cos(degreesToRadians(centroid.lat));

  // Convert to local meters
  const points = polygon.map((p) => ({
    x: (p.lng - centroid.lng) * cosLat * 111320,
    y: (p.lat - centroid.lat) * 111320,
  }));

  // Shoelace formula
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const pi = points[i]!;
    const pj = points[(i + 1) % n]!;
    area += pi.x * pj.y - pj.x * pi.y;
  }

  return Math.abs(area / 2) / 1e6; // m^2 to km^2
}

/**
 * Geometric centroid of a polygon.
 */
export function polygonCentroid(polygon: LatLng[]): LatLng {
  if (polygon.length === 0) return { lat: 0, lng: 0 };
  if (polygon.length === 1) return polygon[0]!;

  let latSum = 0;
  let lngSum = 0;
  for (const p of polygon) {
    latSum += p.lat;
    lngSum += p.lng;
  }
  return {
    lat: latSum / polygon.length,
    lng: lngSum / polygon.length,
  };
}

/**
 * Distance from a point to the nearest edge of a polygon (in metres).
 */
export function pointToPolygonEdgeDistanceM(point: LatLng, polygon: LatLng[]): number {
  if (polygon.length < 2) return 0;

  let minDistKm = Number.POSITIVE_INFINITY;
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    const dist = pointToSegmentDistanceKm(point, a, b);
    if (dist < minDistKm) minDistKm = dist;
  }

  return minDistKm * 1000;
}

/**
 * Create a circular buffer polygon around a point.
 */
export function circleBufferPolygon(center: LatLng, radiusM: number, segments = 32): LatLng[] {
  const points: LatLng[] = [];
  const radiusKm = radiusM / 1000;

  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    const point = destinationPoint(center, radiusKm, (angle * 180) / Math.PI);
    points.push(point);
  }

  return points;
}

/**
 * Simplified polygon overlap area estimation.
 * Uses a grid sampling approach for robustness.
 */
export function polygonOverlapAreaSqKm(polyA: LatLng[], polyB: LatLng[]): number {
  if (polyA.length < 3 || polyB.length < 3) return 0;

  // Get combined bounding box
  const bboxA = computeBoundingBox(polyA);
  const bboxB = computeBoundingBox(polyB);

  const south = Math.max(bboxA.south, bboxB.south);
  const north = Math.min(bboxA.north, bboxB.north);
  const west = Math.max(bboxA.west, bboxB.west);
  const east = Math.min(bboxA.east, bboxB.east);

  if (south >= north || west >= east) return 0;

  // Sample grid within the intersection bounding box
  const steps = 50;
  const latStep = (north - south) / steps;
  const lngStep = (east - west) / steps;

  let insideCount = 0;
  const totalCells = steps * steps;

  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const p: LatLng = {
        lat: south + (i + 0.5) * latStep,
        lng: west + (j + 0.5) * lngStep,
      };
      if (isPointInPolygon(p, polyA) && isPointInPolygon(p, polyB)) {
        insideCount++;
      }
    }
  }

  // Area of the intersection bbox
  const bboxAreaKm2 =
    distanceKm({ lat: south, lng: west }, { lat: south, lng: east }) *
    distanceKm({ lat: south, lng: west }, { lat: north, lng: west });

  return (insideCount / totalCells) * bboxAreaKm2;
}

/**
 * Expand a bounding box by a buffer distance in km.
 */
export function expandBoundingBox(bbox: BoundingBox, bufferKm: number): BoundingBox {
  const latDelta = bufferKm / 111.32;
  const midLat = (bbox.north + bbox.south) / 2;
  const lngDelta = bufferKm / (111.32 * Math.cos(degreesToRadians(midLat)));

  return {
    north: bbox.north + latDelta,
    south: bbox.south - latDelta,
    east: bbox.east + lngDelta,
    west: bbox.west - lngDelta,
  };
}

/**
 * Generate a regular grid of points within a polygon at the specified spacing.
 */
export function generateGridWithinPolygon(polygon: LatLng[], spacingKm: number): LatLng[] {
  if (polygon.length < 3 || spacingKm <= 0) return [];

  const bbox = computeBoundingBox(polygon);
  const latStepDeg = spacingKm / 111.32;
  const midLat = (bbox.north + bbox.south) / 2;
  const lngStepDeg = spacingKm / (111.32 * Math.cos(degreesToRadians(midLat)));

  const points: LatLng[] = [];

  for (let lat = bbox.south + latStepDeg / 2; lat < bbox.north; lat += latStepDeg) {
    for (let lng = bbox.west + lngStepDeg / 2; lng < bbox.east; lng += lngStepDeg) {
      const point: LatLng = { lat, lng };
      if (isPointInPolygon(point, polygon)) {
        points.push(point);
      }
    }
  }

  return points;
}

/**
 * Rotate a grid of points around a center by a given angle (degrees, clockwise).
 */
export function rotateGrid(points: LatLng[], center: LatLng, angleDeg: number): LatLng[] {
  if (angleDeg === 0) return points.map((p) => ({ ...p }));

  const angleRad = degreesToRadians(angleDeg);
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const cosLat = Math.cos(degreesToRadians(center.lat));

  return points.map((p) => {
    // Convert to local coordinates (meters-like, using degree offsets scaled by latitude)
    const dx = (p.lng - center.lng) * cosLat;
    const dy = p.lat - center.lat;

    // Rotate
    const rx = dx * cosA - dy * sinA;
    const ry = dx * sinA + dy * cosA;

    // Convert back
    return {
      lat: center.lat + ry,
      lng: center.lng + rx / cosLat,
    };
  });
}

/**
 * Compute a bounding box for a set of coordinates.
 */
export function computeBoundingBox(points: LatLng[]): BoundingBox {
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  for (const p of points) {
    if (p.lat > north) north = p.lat;
    if (p.lat < south) south = p.lat;
    if (p.lng > east) east = p.lng;
    if (p.lng < west) west = p.lng;
  }

  return { north, south, east, west };
}

// --- Internal helpers ---

/**
 * Compute destination point given distance and bearing from start point.
 */
function destinationPoint(start: LatLng, distanceKmVal: number, bearingDeg: number): LatLng {
  const angularDist = distanceKmVal / EARTH_RADIUS_KM;
  const bearingRad = degreesToRadians(bearingDeg);
  const lat1 = degreesToRadians(start.lat);
  const lng1 = degreesToRadians(start.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDist) +
    Math.cos(lat1) * Math.sin(angularDist) * Math.cos(bearingRad),
  );

  const lng2 = lng1 + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angularDist) * Math.cos(lat1),
    Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2),
  );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lng2 * 180) / Math.PI,
  };
}

/**
 * Shortest distance from a point to a line segment (haversine-based).
 */
function pointToSegmentDistanceKm(point: LatLng, segA: LatLng, segB: LatLng): number {
  const dAB = distanceKm(segA, segB);
  if (dAB === 0) return distanceKm(point, segA);

  // Project point onto the segment using a parametric approach
  const cosLatA = Math.cos(degreesToRadians(segA.lat));
  const dx = (segB.lng - segA.lng) * cosLatA;
  const dy = segB.lat - segA.lat;
  const px = (point.lng - segA.lng) * cosLatA;
  const py = point.lat - segA.lat;

  const lenSq = dx * dx + dy * dy;
  let t = (px * dx + py * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closest: LatLng = {
    lat: segA.lat + t * dy,
    lng: segA.lng + t * dx / cosLatA,
  };

  return distanceKm(point, closest);
}
