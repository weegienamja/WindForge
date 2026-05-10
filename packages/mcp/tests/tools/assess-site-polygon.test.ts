import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@jamieblair/windforge-core', () => ({
  assessSite: vi.fn(),
  createBoundary: vi.fn((polygon: unknown, name?: string) => ({
    id: 'boundary-1',
    name: name ?? 'Unnamed',
    polygon,
    areaSqKm: 1,
    centroid: { lat: 0, lng: 0 },
    boundingBox: { north: 1, south: -1, east: 1, west: -1 },
  })),
  getTurbineById: vi.fn(),
}));

import { assessSite, createBoundary, getTurbineById } from '@jamieblair/windforge-core';
import { assessSitePolygonTool } from '../../src/tools/assess-site-polygon.js';

const assessSiteMock = assessSite as unknown as ReturnType<typeof vi.fn>;
const createBoundaryMock = createBoundary as unknown as ReturnType<typeof vi.fn>;
const getTurbineByIdMock = getTurbineById as unknown as ReturnType<typeof vi.fn>;

const validPolygon = [
  { lat: 55.0, lng: -4.0 },
  { lat: 55.1, lng: -4.0 },
  { lat: 55.05, lng: -3.9 },
];

describe('assess_site_polygon tool', () => {
  beforeEach(() => {
    assessSiteMock.mockReset();
    createBoundaryMock.mockClear();
    getTurbineByIdMock.mockReset();
  });

  it('rejects polygons with fewer than 3 points', () => {
    const parsed = assessSitePolygonTool.inputSchema.safeParse({
      polygon: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a 3-point polygon', () => {
    const parsed = assessSitePolygonTool.inputSchema.safeParse({ polygon: validPolygon });
    expect(parsed.success).toBe(true);
  });

  it('builds a boundary and calls assessSite', async () => {
    assessSiteMock.mockResolvedValueOnce({ ok: true, value: { sample: true } });
    const out = await assessSitePolygonTool.handler({ polygon: validPolygon, name: 'Test Site' });
    expect(createBoundaryMock).toHaveBeenCalledWith(expect.any(Array), 'Test Site');
    expect(assessSiteMock).toHaveBeenCalled();
    expect('ok' in out && out.ok).toBe(true);
  });

  it('returns TURBINE_NOT_FOUND when turbineId is unknown', async () => {
    getTurbineByIdMock.mockReturnValueOnce(undefined);
    const out = await assessSitePolygonTool.handler({
      polygon: validPolygon,
      turbineId: 'no-such-turbine',
    });
    expect('error' in out).toBe(true);
    if ('error' in out) expect(out.error.code).toBe('TURBINE_NOT_FOUND');
    expect(assessSiteMock).not.toHaveBeenCalled();
  });

  it('propagates assessSite errors', async () => {
    assessSiteMock.mockResolvedValueOnce({
      ok: false,
      error: { code: 'TIMEOUT', message: 'Overpass timeout' },
    });
    const out = await assessSitePolygonTool.handler({ polygon: validPolygon });
    expect('error' in out).toBe(true);
    if ('error' in out) expect(out.error.code).toBe('TIMEOUT');
  });
});
