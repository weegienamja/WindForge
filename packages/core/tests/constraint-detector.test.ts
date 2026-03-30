import { describe, it, expect } from 'vitest';
import { detectConstraints } from '../src/constraints/constraint-detector.js';
import { createBoundary } from '../src/site/site-boundary.js';
import type { ConstraintOverpassResponse } from '../src/constraints/constraint-queries.js';
import type { LatLng } from '../src/types/analysis.js';

const SQUARE: LatLng[] = [
  { lat: 55.86, lng: -4.26 },
  { lat: 55.86, lng: -4.25 },
  { lat: 55.87, lng: -4.25 },
  { lat: 55.87, lng: -4.26 },
];

function makeBoundary() {
  return createBoundary(SQUARE, 'Test Site');
}

function makeOsmData(elements: ConstraintOverpassResponse['elements']): ConstraintOverpassResponse {
  return { elements };
}

describe('detectConstraints', () => {
  it('returns empty report for no elements', () => {
    const boundary = makeBoundary();
    const report = detectConstraints(boundary, makeOsmData([]));
    expect(report.hardConstraints).toHaveLength(0);
    expect(report.softConstraints).toHaveLength(0);
    expect(report.infoConstraints).toHaveLength(0);
    expect(report.summary.recommendation).toBe('proceed');
  });

  it('detects a nature reserve inside the site', () => {
    const boundary = makeBoundary();
    const report = detectConstraints(boundary, makeOsmData([
      { type: 'node', id: 1, lat: 55.865, lon: -4.255, tags: { leisure: 'nature_reserve', name: 'Test Reserve' } },
    ]));
    expect(report.hardConstraints.length).toBeGreaterThanOrEqual(1);
    expect(report.hardConstraints[0]!.definition.id).toBe('nature_reserve');
  });

  it('detects an airport within setback distance', () => {
    const boundary = makeBoundary();
    // Airport 3km away (within 5km setback)
    const report = detectConstraints(boundary, makeOsmData([
      { type: 'node', id: 2, lat: 55.89, lon: -4.255, tags: { aeroway: 'aerodrome', name: 'Test Airport' } },
    ]));
    expect(report.hardConstraints.length).toBeGreaterThanOrEqual(1);
    const airport = report.hardConstraints.find((c) => c.definition.id === 'airport');
    expect(airport).toBeDefined();
  });

  it('detects residential dwelling within setback', () => {
    const boundary = makeBoundary();
    // Dwelling 200m from boundary (within 500m setback)
    const report = detectConstraints(boundary, makeOsmData([
      { type: 'node', id: 3, lat: 55.858, lon: -4.255, tags: { building: 'residential' } },
    ]));
    const dwelling = report.softConstraints.find((c) => c.definition.id === 'dwelling') ??
                     report.hardConstraints.find((c) => c.definition.id === 'dwelling');
    expect(dwelling).toBeDefined();
  });

  it('detects existing wind turbines as info', () => {
    const boundary = makeBoundary();
    const report = detectConstraints(boundary, makeOsmData([
      { type: 'node', id: 4, lat: 55.88, lon: -4.255, tags: { 'generator:source': 'wind' } },
    ]));
    expect(report.infoConstraints.length).toBeGreaterThanOrEqual(1);
    const windTurbine = report.infoConstraints.find((c) => c.definition.id === 'existing_wind');
    expect(windTurbine).toBeDefined();
  });

  it('updates nearest receptor table for dwellings', () => {
    const boundary = makeBoundary();
    const report = detectConstraints(boundary, makeOsmData([
      { type: 'node', id: 5, lat: 55.858, lon: -4.255, tags: { building: 'residential' } },
    ]));
    expect(report.nearestReceptors.nearestDwellingM).not.toBeNull();
    expect(report.nearestReceptors.nearestDwellingM).toBeGreaterThan(0);
  });

  it('detects military land', () => {
    const boundary = makeBoundary();
    const report = detectConstraints(boundary, makeOsmData([
      { type: 'node', id: 6, lat: 55.865, lon: -4.255, tags: { landuse: 'military' } },
    ]));
    expect(report.hardConstraints.length).toBeGreaterThanOrEqual(1);
  });

  it('detects heritage sites within setback', () => {
    const boundary = makeBoundary();
    // Heritage site 500m away (within 1km setback)
    const report = detectConstraints(boundary, makeOsmData([
      { type: 'node', id: 7, lat: 55.856, lon: -4.255, tags: { historic: 'castle', name: 'Test Castle' } },
    ]));
    const heritage = report.softConstraints.find((c) => c.definition.id === 'heritage') ??
                     report.hardConstraints.find((c) => c.definition.id === 'heritage');
    expect(heritage).toBeDefined();
  });

  it('detects railways within setback', () => {
    const boundary = makeBoundary();
    const report = detectConstraints(boundary, makeOsmData([
      { type: 'node', id: 8, lat: 55.8605, lon: -4.255, tags: { railway: 'rail' } },
    ]));
    const railway = report.softConstraints.find((c) => c.definition.id === 'railway') ??
                    report.hardConstraints.find((c) => c.definition.id === 'railway');
    expect(railway).toBeDefined();
  });

  it('builds summary with correct recommendation for many hard constraints', () => {
    const boundary = makeBoundary();
    const report = detectConstraints(boundary, makeOsmData([
      { type: 'node', id: 10, lat: 55.865, lon: -4.255, tags: { leisure: 'nature_reserve' } },
      { type: 'node', id: 11, lat: 55.865, lon: -4.254, tags: { landuse: 'military' } },
      { type: 'node', id: 12, lat: 55.865, lon: -4.253, tags: { leisure: 'nature_reserve' } },
    ]));
    expect(report.summary.totalHard).toBeGreaterThanOrEqual(3);
    expect(report.summary.recommendation).toBe('likely_unviable');
  });

  it('recommends proceed when no constraints', () => {
    const boundary = makeBoundary();
    const report = detectConstraints(boundary, makeOsmData([]));
    expect(report.summary.recommendation).toBe('proceed');
  });

  it('detects water bodies', () => {
    const boundary = makeBoundary();
    const report = detectConstraints(boundary, makeOsmData([
      { type: 'node', id: 13, lat: 55.865, lon: -4.255, tags: { natural: 'water' } },
    ]));
    // Water body is soft with 50m setback, inside site should be detected
    const water = [...report.softConstraints, ...report.hardConstraints, ...report.infoConstraints]
      .find((c) => c.definition.id === 'waterbody');
    expect(water).toBeDefined();
  });
});
