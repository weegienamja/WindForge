import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@jamieblair/windforge-core', () => ({
  createBoundary: vi.fn((polygon: unknown, name?: string) => ({
    id: 'b',
    name: name ?? 'Unnamed',
    polygon,
    areaSqKm: 1,
    centroid: { lat: 0, lng: 0 },
    boundingBox: { north: 1, south: -1, east: 1, west: -1 },
  })),
  fetchConstraintData: vi.fn(),
  detectConstraints: vi.fn(),
}));

import { createBoundary, fetchConstraintData, detectConstraints } from '@jamieblair/windforge-core';
import { detectConstraintsTool } from '../../src/tools/detect-constraints.js';

const createBoundaryMock = createBoundary as unknown as ReturnType<typeof vi.fn>;
const fetchConstraintDataMock = fetchConstraintData as unknown as ReturnType<typeof vi.fn>;
const detectConstraintsMock = detectConstraints as unknown as ReturnType<typeof vi.fn>;

const validPolygon = [
  { lat: 55.0, lng: -4.0 },
  { lat: 55.1, lng: -4.0 },
  { lat: 55.05, lng: -3.9 },
];

describe('detect_constraints tool', () => {
  beforeEach(() => {
    createBoundaryMock.mockClear();
    fetchConstraintDataMock.mockReset();
    detectConstraintsMock.mockReset();
  });

  it('rejects polygons with fewer than 3 points', () => {
    const parsed = detectConstraintsTool.inputSchema.safeParse({
      polygon: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
    });
    expect(parsed.success).toBe(false);
  });

  it('returns success with the constraint report', async () => {
    fetchConstraintDataMock.mockResolvedValueOnce({ ok: true, value: { ways: [], nodes: [] } });
    detectConstraintsMock.mockReturnValueOnce({
      hardConstraints: [],
      softConstraints: [],
      infoConstraints: [],
    });
    const out = await detectConstraintsTool.handler({ polygon: validPolygon, name: 'Site' });
    expect(createBoundaryMock).toHaveBeenCalledWith(expect.any(Array), 'Site');
    expect(detectConstraintsMock).toHaveBeenCalled();
    expect('ok' in out && out.ok).toBe(true);
  });

  it('propagates Overpass fetch errors', async () => {
    fetchConstraintDataMock.mockResolvedValueOnce({
      ok: false,
      error: { code: 'TIMEOUT', message: 'Overpass timeout' },
    });
    const out = await detectConstraintsTool.handler({ polygon: validPolygon });
    expect('error' in out && out.error.code).toBe('TIMEOUT');
    expect(detectConstraintsMock).not.toHaveBeenCalled();
  });

  it('does not crash on a minimum-size polygon', async () => {
    fetchConstraintDataMock.mockResolvedValueOnce({ ok: true, value: { ways: [], nodes: [] } });
    detectConstraintsMock.mockReturnValueOnce({ hardConstraints: [] });
    const out = await detectConstraintsTool.handler({ polygon: validPolygon });
    expect('ok' in out && out.ok).toBe(true);
  });
});
