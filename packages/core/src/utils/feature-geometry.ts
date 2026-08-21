import {
  area,
  booleanIntersects,
  booleanPointInPolygon,
  buffer,
  distance,
  featureCollection,
  intersect,
  lineString,
  multiLineString,
  multiPolygon,
  point,
  pointOnFeature,
  pointToLineDistance,
  polygon,
} from '@turf/turf';
import type {
  Feature,
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from 'geojson';
import type { LatLng } from '../types/analysis.js';
import type { SiteBoundary } from '../types/site.js';

export type SupportedGeometry = Point | LineString | MultiLineString | Polygon | MultiPolygon;

export interface OsmGeometryPoint {
  lat: number;
  lon: number;
}

export interface OsmGeometryMember {
  type: string;
  role?: string;
  geometry?: OsmGeometryPoint[];
}

export interface OsmGeometryElement {
  type: string;
  lat?: number;
  lon?: number;
  center?: OsmGeometryPoint;
  geometry?: OsmGeometryPoint[];
  members?: OsmGeometryMember[];
  tags?: Record<string, string>;
}

const toPosition = (p: OsmGeometryPoint): Position => [p.lon, p.lat];
const toLatLng = (p: Position): LatLng => ({ lat: Number(p[1]), lng: Number(p[0]) });

function positionsEqual(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function closeRing(input: Position[]): Position[] {
  if (input.length === 0) return [];
  const ring = input.map((p) => [Number(p[0]), Number(p[1])] satisfies Position);
  if (!positionsEqual(ring[0]!, ring[ring.length - 1]!)) ring.push([...ring[0]!] as Position);
  return ring;
}

function isClosed(input: Position[]): boolean {
  return input.length >= 4 && positionsEqual(input[0]!, input[input.length - 1]!);
}

function tagsDescribeArea(tags: Record<string, string>): boolean {
  if (tags.area === 'yes') return true;
  if (tags.area === 'no') return false;
  return Boolean(
    tags.building ||
      tags.landuse ||
      tags.leisure ||
      tags.boundary ||
      tags.natural === 'water' ||
      tags.aeroway === 'aerodrome' ||
      tags.aeroway === 'helipad' ||
      tags.power === 'substation',
  );
}

/** Join relation member fragments into closed rings without discarding separate outers. */
function stitchRings(fragments: Position[][]): Position[][] {
  const pending = fragments.filter((f) => f.length >= 2).map((f) => [...f]);
  const rings: Position[][] = [];

  while (pending.length > 0) {
    const current = pending.shift()!;
    let progressed = true;
    while (!isClosed(current) && progressed) {
      progressed = false;
      for (let i = 0; i < pending.length; i++) {
        const candidate = pending[i]!;
        const first = current[0]!;
        const last = current[current.length - 1]!;
        const cFirst = candidate[0]!;
        const cLast = candidate[candidate.length - 1]!;

        if (positionsEqual(last, cFirst)) current.push(...candidate.slice(1));
        else if (positionsEqual(last, cLast)) current.push(...[...candidate].reverse().slice(1));
        else if (positionsEqual(first, cLast)) current.unshift(...candidate.slice(0, -1));
        else if (positionsEqual(first, cFirst))
          current.unshift(...[...candidate].reverse().slice(0, -1));
        else continue;

        pending.splice(i, 1);
        progressed = true;
        break;
      }
    }

    if (isClosed(current)) rings.push(closeRing(current));
  }

  return rings;
}

function relationPolygon(element: OsmGeometryElement): Polygon | MultiPolygon | null {
  const outerFragments: Position[][] = [];
  const innerFragments: Position[][] = [];
  for (const member of element.members ?? []) {
    if (member.type !== 'way' || !member.geometry) continue;
    const positions = member.geometry.map(toPosition);
    if (member.role === 'inner') innerFragments.push(positions);
    else outerFragments.push(positions);
  }

  const outers = stitchRings(outerFragments);
  const inners = stitchRings(innerFragments);
  if (outers.length === 0) return null;

  const polygons = outers.map((outer) => [outer]);
  for (const hole of inners) {
    const probe = point(hole[0]!);
    const owner = polygons.find((candidate) => booleanPointInPolygon(probe, polygon(candidate)));
    owner?.push(hole);
  }

  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0]! }
    : { type: 'MultiPolygon', coordinates: polygons };
}

/** Convert Overpass `out geom` output to a real GeoJSON geometry. */
export function osmElementToGeometry(element: OsmGeometryElement): SupportedGeometry | null {
  if (element.type === 'node' && element.lat !== undefined && element.lon !== undefined) {
    return { type: 'Point', coordinates: [element.lon, element.lat] };
  }

  if (element.type === 'relation') {
    const relation = relationPolygon(element);
    if (relation) return relation;
  }

  if (element.geometry && element.geometry.length > 0) {
    const positions = element.geometry.map(toPosition);
    if (tagsDescribeArea(element.tags ?? {}) && positions.length >= 3) {
      return { type: 'Polygon', coordinates: [closeRing(positions)] };
    }
    if (positions.length === 1) return { type: 'Point', coordinates: positions[0]! };
    return { type: 'LineString', coordinates: positions };
  }

  if (element.center) {
    return { type: 'Point', coordinates: [element.center.lon, element.center.lat] };
  }

  return null;
}

export function geometryFeature(geometry: SupportedGeometry): Feature<SupportedGeometry> {
  switch (geometry.type) {
    case 'Point':
      return point(geometry.coordinates);
    case 'LineString':
      return lineString(geometry.coordinates);
    case 'MultiLineString':
      return multiLineString(geometry.coordinates);
    case 'Polygon':
      return polygon(geometry.coordinates);
    case 'MultiPolygon':
      return multiPolygon(geometry.coordinates);
  }
}

export function sitePolygonFeature(boundary: SiteBoundary): Feature<Polygon> {
  return polygon([closeRing(boundary.polygon.map((p) => [p.lng, p.lat]))]);
}

export function representativeLocation(geometry: SupportedGeometry): LatLng {
  return toLatLng(pointOnFeature(geometryFeature(geometry)).geometry.coordinates);
}

export function geometryIntersectsSite(
  geometry: SupportedGeometry,
  boundary: SiteBoundary,
): boolean {
  return booleanIntersects(geometryFeature(geometry), sitePolygonFeature(boundary));
}

function geometryLines(geometry: SupportedGeometry): Position[][] {
  switch (geometry.type) {
    case 'Point':
      return [];
    case 'LineString':
      return [geometry.coordinates];
    case 'MultiLineString':
      return geometry.coordinates;
    case 'Polygon':
      return geometry.coordinates;
    case 'MultiPolygon':
      return geometry.coordinates.flat();
  }
}

function lineVerticesDistanceKm(from: Position[][], to: Position[][]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const sourceLine of from) {
    for (const vertex of sourceLine) {
      for (const targetLine of to) {
        if (targetLine.length < 2) continue;
        minimum = Math.min(
          minimum,
          pointToLineDistance(point(vertex), lineString(targetLine), { units: 'kilometers' }),
        );
      }
    }
  }
  return minimum;
}

/** Exact intersection, otherwise nearest edge/segment distance in metres. */
export function geometryDistanceToSiteM(
  geometry: SupportedGeometry,
  boundary: SiteBoundary,
): number {
  if (geometryIntersectsSite(geometry, boundary)) return 0;

  const siteLines = geometryLines(sitePolygonFeature(boundary).geometry);
  if (geometry.type === 'Point') {
    return lineVerticesDistanceKm([[geometry.coordinates]], siteLines) * 1000;
  }

  const featureLines = geometryLines(geometry);
  const distanceKm = Math.min(
    lineVerticesDistanceKm(featureLines, siteLines),
    lineVerticesDistanceKm(siteLines, featureLines),
  );
  return Number.isFinite(distanceKm) ? distanceKm * 1000 : Number.POSITIVE_INFINITY;
}

/** Distance from a point to the actual feature geometry in metres. */
export function geometryDistanceToPointM(geometry: SupportedGeometry, location: LatLng): number {
  const probe = point([location.lng, location.lat]);
  if (
    (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') &&
    booleanPointInPolygon(probe, geometryFeature(geometry) as Feature<Polygon | MultiPolygon>)
  ) {
    return 0;
  }
  if (geometry.type === 'Point') {
    return distance(point(geometry.coordinates), probe, { units: 'kilometers' }) * 1000;
  }
  const distanceKm = lineVerticesDistanceKm(
    [[[location.lng, location.lat]]],
    geometryLines(geometry),
  );
  return Number.isFinite(distanceKm) ? distanceKm * 1000 : Number.POSITIVE_INFINITY;
}

export function geometryIntersectionAreaSqKm(
  geometry: SupportedGeometry,
  boundary: SiteBoundary,
): number {
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return 0;
  const clipped = intersect(
    featureCollection<Polygon | MultiPolygon>([
      sitePolygonFeature(boundary),
      geometryFeature(geometry) as Feature<Polygon | MultiPolygon>,
    ]),
  );
  return clipped ? area(clipped) / 1_000_000 : 0;
}

export interface ClippedPolygon {
  polygon: LatLng[];
  holes: LatLng[][];
  areaSqKm: number;
}

function polygonParts(geometry: Polygon | MultiPolygon): Position[][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

/** Buffer any supported feature, clip it to the site and preserve polygon holes. */
export function bufferAndClipGeometry(
  geometry: SupportedGeometry,
  boundary: SiteBoundary,
  setbackM: number,
): ClippedPolygon[] {
  const source = geometryFeature(geometry);
  const buffered = setbackM > 0 ? buffer(source, setbackM, { units: 'meters' }) : source;
  if (
    !buffered ||
    (buffered.geometry.type !== 'Polygon' && buffered.geometry.type !== 'MultiPolygon')
  ) {
    return [];
  }
  const clipped = intersect(
    featureCollection([sitePolygonFeature(boundary), buffered as Feature<Polygon | MultiPolygon>]),
  );
  if (!clipped) return [];

  return polygonParts(clipped.geometry).map((rings) => ({
    polygon: rings[0]!.map(toLatLng),
    holes: rings.slice(1).map((ring) => ring.map(toLatLng)),
    areaSqKm: area(polygon(rings)) / 1_000_000,
  }));
}

export function pointInPolygonWithHoles(
  location: LatLng,
  exterior: LatLng[],
  holes: LatLng[][] = [],
): boolean {
  const rings = [exterior, ...holes].map((ring) => closeRing(ring.map((p) => [p.lng, p.lat])));
  return booleanPointInPolygon(point([location.lng, location.lat]), polygon(rings));
}
