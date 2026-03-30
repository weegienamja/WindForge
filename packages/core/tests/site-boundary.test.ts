import { describe, it, expect } from 'vitest';
import { createBoundary, generateSampleGrid, parseBoundaryFromGeoJSON, parseBoundaryFromKML } from '../src/site/site-boundary.js';
import type { LatLng } from '../src/types/analysis.js';

const SQUARE: LatLng[] = [
  { lat: 55.86, lng: -4.26 },
  { lat: 55.86, lng: -4.25 },
  { lat: 55.87, lng: -4.25 },
  { lat: 55.87, lng: -4.26 },
];

describe('createBoundary', () => {
  it('creates a boundary with correct properties', () => {
    const boundary = createBoundary(SQUARE, 'Test Site');
    expect(boundary.name).toBe('Test Site');
    expect(boundary.polygon).toHaveLength(4);
    expect(boundary.areaSqKm).toBeGreaterThan(0);
    expect(boundary.centroid.lat).toBeCloseTo(55.865, 2);
    expect(boundary.centroid.lng).toBeCloseTo(-4.255, 2);
    expect(boundary.boundingBox.north).toBeCloseTo(55.87, 2);
    expect(boundary.boundingBox.south).toBeCloseTo(55.86, 2);
  });

  it('assigns auto-generated name when none provided', () => {
    const boundary = createBoundary(SQUARE);
    expect(boundary.name).toContain('Site');
  });

  it('generates unique IDs', () => {
    const b1 = createBoundary(SQUARE, 'A');
    const b2 = createBoundary(SQUARE, 'B');
    expect(b1.id).not.toBe(b2.id);
  });
});

describe('generateSampleGrid', () => {
  it('generates points inside the boundary', () => {
    const boundary = createBoundary(SQUARE, 'Test');
    const points = generateSampleGrid(boundary);
    expect(points.length).toBeGreaterThan(0);
  });

  it('generates more points with smaller spacing', () => {
    const boundary = createBoundary(SQUARE, 'Test');
    const coarse = generateSampleGrid(boundary, 1);
    const fine = generateSampleGrid(boundary, 0.2);
    expect(fine.length).toBeGreaterThanOrEqual(coarse.length);
  });

  it('uses default spacing based on area', () => {
    const boundary = createBoundary(SQUARE, 'Test');
    const points = generateSampleGrid(boundary);
    expect(points.length).toBeGreaterThan(0);
  });
});

describe('parseBoundaryFromGeoJSON', () => {
  it('parses a Feature with Polygon geometry', () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      properties: { name: 'Test' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-4.26, 55.86], [-4.25, 55.86], [-4.25, 55.87], [-4.26, 55.87], [-4.26, 55.86]]],
      },
    });
    const result = parseBoundaryFromGeoJSON(geojson);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.polygon.length).toBeGreaterThanOrEqual(4);
      expect(result.value.name).toBeTruthy();
    }
  });

  it('parses a bare Polygon geometry', () => {
    const geojson = JSON.stringify({
      type: 'Polygon',
      coordinates: [[[-4.26, 55.86], [-4.25, 55.86], [-4.25, 55.87], [-4.26, 55.87], [-4.26, 55.86]]],
    });
    const result = parseBoundaryFromGeoJSON(geojson);
    expect(result.ok).toBe(true);
  });

  it('parses a FeatureCollection', () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[[-4.26, 55.86], [-4.25, 55.86], [-4.25, 55.87], [-4.26, 55.87], [-4.26, 55.86]]],
          },
        },
      ],
    });
    const result = parseBoundaryFromGeoJSON(geojson);
    expect(result.ok).toBe(true);
  });

  it('returns error for invalid JSON', () => {
    const result = parseBoundaryFromGeoJSON('not json');
    expect(result.ok).toBe(false);
  });

  it('returns error for non-polygon geometry', () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [-4.25, 55.86] },
    });
    const result = parseBoundaryFromGeoJSON(geojson);
    expect(result.ok).toBe(false);
  });
});

describe('parseBoundaryFromKML', () => {
  it('parses valid KML with coordinates', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Test Site</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>-4.26,55.86,0 -4.25,55.86,0 -4.25,55.87,0 -4.26,55.87,0 -4.26,55.86,0</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;
    const result = parseBoundaryFromKML(kml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.polygon.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('returns error for KML without coordinates', () => {
    const kml = '<kml><Document></Document></kml>';
    const result = parseBoundaryFromKML(kml);
    expect(result.ok).toBe(false);
  });
});
