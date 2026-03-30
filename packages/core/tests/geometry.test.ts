import { describe, it, expect } from 'vitest';
import {
  isPointInPolygon,
  polygonAreaSqKm,
  polygonCentroid,
  pointToPolygonEdgeDistanceM,
  circleBufferPolygon,
  polygonOverlapAreaSqKm,
  expandBoundingBox,
  generateGridWithinPolygon,
  rotateGrid,
  computeBoundingBox,
} from '../src/utils/geometry.js';
import type { LatLng } from '../src/types/analysis.js';

// A simple square polygon roughly 1km x 1km near Glasgow
const SQUARE: LatLng[] = [
  { lat: 55.86, lng: -4.26 },
  { lat: 55.86, lng: -4.25 },
  { lat: 55.87, lng: -4.25 },
  { lat: 55.87, lng: -4.26 },
];

// Triangle
const TRIANGLE: LatLng[] = [
  { lat: 55.0, lng: -4.0 },
  { lat: 55.0, lng: -3.98 },
  { lat: 55.01, lng: -3.99 },
];

describe('isPointInPolygon', () => {
  it('returns true for a point inside a square', () => {
    expect(isPointInPolygon({ lat: 55.865, lng: -4.255 }, SQUARE)).toBe(true);
  });

  it('returns false for a point outside a square', () => {
    expect(isPointInPolygon({ lat: 55.85, lng: -4.255 }, SQUARE)).toBe(false);
  });

  it('returns true for a point inside a triangle', () => {
    expect(isPointInPolygon({ lat: 55.003, lng: -3.99 }, TRIANGLE)).toBe(true);
  });

  it('returns false for a point outside a triangle', () => {
    expect(isPointInPolygon({ lat: 55.02, lng: -3.99 }, TRIANGLE)).toBe(false);
  });

  it('returns false for an empty polygon', () => {
    expect(isPointInPolygon({ lat: 55, lng: -4 }, [])).toBe(false);
  });

  it('returns false for a line (2 points)', () => {
    expect(isPointInPolygon({ lat: 55, lng: -4 }, [{ lat: 55, lng: -4 }, { lat: 55, lng: -3 }])).toBe(false);
  });

  it('handles concave polygons', () => {
    const concave: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
    ];
    // Inside the notch - should be false
    expect(isPointInPolygon({ lat: 1, lng: 1.5 }, concave)).toBe(false);
    // Inside the body - should be true
    expect(isPointInPolygon({ lat: 0.5, lng: 0.5 }, concave)).toBe(true);
  });
});

describe('polygonAreaSqKm', () => {
  it('returns 0 for empty polygon', () => {
    expect(polygonAreaSqKm([])).toBe(0);
  });

  it('returns 0 for a line', () => {
    expect(polygonAreaSqKm([{ lat: 0, lng: 0 }, { lat: 1, lng: 0 }])).toBe(0);
  });

  it('computes area of a roughly 1km x 1km square', () => {
    const area = polygonAreaSqKm(SQUARE);
    // Should be around 0.7 - 1.5 km^2
    expect(area).toBeGreaterThan(0.5);
    expect(area).toBeLessThan(2.0);
  });

  it('computes area of a larger polygon', () => {
    const large: LatLng[] = [
      { lat: 55.0, lng: -4.0 },
      { lat: 55.0, lng: -3.9 },
      { lat: 55.1, lng: -3.9 },
      { lat: 55.1, lng: -4.0 },
    ];
    const area = polygonAreaSqKm(large);
    // ~10x10 km = ~70 km^2 (varies with latitude)
    expect(area).toBeGreaterThan(40);
    expect(area).toBeLessThan(100);
  });
});

describe('polygonCentroid', () => {
  it('returns {0,0} for empty polygon', () => {
    expect(polygonCentroid([])).toEqual({ lat: 0, lng: 0 });
  });

  it('returns the point itself for single point', () => {
    expect(polygonCentroid([{ lat: 55, lng: -4 }])).toEqual({ lat: 55, lng: -4 });
  });

  it('computes correct centroid for a square', () => {
    const c = polygonCentroid(SQUARE);
    expect(c.lat).toBeCloseTo(55.865, 3);
    expect(c.lng).toBeCloseTo(-4.255, 3);
  });
});

describe('pointToPolygonEdgeDistanceM', () => {
  it('returns 0 for empty polygon', () => {
    expect(pointToPolygonEdgeDistanceM({ lat: 55, lng: -4 }, [])).toBe(0);
  });

  it('returns small distance for point near edge', () => {
    // Point is very close to the south edge of the square
    const dist = pointToPolygonEdgeDistanceM({ lat: 55.8601, lng: -4.255 }, SQUARE);
    expect(dist).toBeLessThan(200);
    expect(dist).toBeGreaterThan(0);
  });

  it('returns larger distance for faraway point', () => {
    const dist = pointToPolygonEdgeDistanceM({ lat: 55.9, lng: -4.255 }, SQUARE);
    expect(dist).toBeGreaterThan(2000);
  });
});

describe('circleBufferPolygon', () => {
  it('creates a polygon with the expected number of segments', () => {
    const circle = circleBufferPolygon({ lat: 55, lng: -4 }, 1000, 16);
    expect(circle).toHaveLength(16);
  });

  it('all points are roughly the right distance from center', () => {
    const center = { lat: 55, lng: -4 };
    const radiusM = 500;
    const circle = circleBufferPolygon(center, radiusM, 32);
    // Import distanceKm from geo to check distances
    for (const p of circle) {
      const dLat = (p.lat - center.lat) * 111320;
      const dLng = (p.lng - center.lng) * 111320 * Math.cos(center.lat * Math.PI / 180);
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      expect(dist).toBeGreaterThan(400);
      expect(dist).toBeLessThan(600);
    }
  });
});

describe('polygonOverlapAreaSqKm', () => {
  it('returns 0 for non-overlapping polygons', () => {
    const polyA: LatLng[] = [
      { lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 1, lng: 0 },
    ];
    const polyB: LatLng[] = [
      { lat: 2, lng: 2 }, { lat: 2, lng: 3 }, { lat: 3, lng: 3 }, { lat: 3, lng: 2 },
    ];
    expect(polygonOverlapAreaSqKm(polyA, polyB)).toBe(0);
  });

  it('returns positive area for overlapping polygons', () => {
    const polyA: LatLng[] = [
      { lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 1, lng: 0 },
    ];
    const polyB: LatLng[] = [
      { lat: 0.5, lng: 0.5 }, { lat: 0.5, lng: 1.5 }, { lat: 1.5, lng: 1.5 }, { lat: 1.5, lng: 0.5 },
    ];
    const overlap = polygonOverlapAreaSqKm(polyA, polyB);
    expect(overlap).toBeGreaterThan(0);
  });

  it('returns 0 for degenerate polygons', () => {
    expect(polygonOverlapAreaSqKm([], SQUARE)).toBe(0);
    expect(polygonOverlapAreaSqKm(SQUARE, [])).toBe(0);
  });
});

describe('expandBoundingBox', () => {
  it('expands a bounding box by the given buffer', () => {
    const bbox = { north: 55.87, south: 55.86, east: -4.25, west: -4.26 };
    const expanded = expandBoundingBox(bbox, 1);
    expect(expanded.north).toBeGreaterThan(bbox.north);
    expect(expanded.south).toBeLessThan(bbox.south);
    expect(expanded.east).toBeGreaterThan(bbox.east);
    expect(expanded.west).toBeLessThan(bbox.west);
  });

  it('does not change bbox with 0 buffer', () => {
    const bbox = { north: 55.87, south: 55.86, east: -4.25, west: -4.26 };
    const expanded = expandBoundingBox(bbox, 0);
    expect(expanded.north).toBeCloseTo(bbox.north, 10);
    expect(expanded.south).toBeCloseTo(bbox.south, 10);
  });
});

describe('generateGridWithinPolygon', () => {
  it('generates points inside the polygon', () => {
    const points = generateGridWithinPolygon(SQUARE, 0.3);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(isPointInPolygon(p, SQUARE)).toBe(true);
    }
  });

  it('returns empty array for degenerate polygon', () => {
    expect(generateGridWithinPolygon([], 1)).toEqual([]);
  });

  it('returns empty array for zero spacing', () => {
    expect(generateGridWithinPolygon(SQUARE, 0)).toEqual([]);
  });

  it('generates more points with smaller spacing', () => {
    const coarse = generateGridWithinPolygon(SQUARE, 1);
    const fine = generateGridWithinPolygon(SQUARE, 0.2);
    expect(fine.length).toBeGreaterThan(coarse.length);
  });
});

describe('rotateGrid', () => {
  it('returns same points for 0 degree rotation', () => {
    const points: LatLng[] = [{ lat: 55, lng: -4 }, { lat: 55.01, lng: -4 }];
    const rotated = rotateGrid(points, { lat: 55.005, lng: -4 }, 0);
    expect(rotated).toHaveLength(2);
    expect(rotated[0]!.lat).toBeCloseTo(55, 3);
    expect(rotated[0]!.lng).toBeCloseTo(-4, 3);
  });

  it('rotates 180 degrees to mirror points', () => {
    const center = { lat: 55, lng: -4 };
    const points: LatLng[] = [{ lat: 55.01, lng: -4 }];
    const rotated = rotateGrid(points, center, 180);
    expect(rotated[0]!.lat).toBeCloseTo(54.99, 2);
  });
});

describe('computeBoundingBox', () => {
  it('computes correct bounding box', () => {
    const bbox = computeBoundingBox(SQUARE);
    expect(bbox.north).toBeCloseTo(55.87, 5);
    expect(bbox.south).toBeCloseTo(55.86, 5);
    expect(bbox.east).toBeCloseTo(-4.25, 5);
    expect(bbox.west).toBeCloseTo(-4.26, 5);
  });
});
