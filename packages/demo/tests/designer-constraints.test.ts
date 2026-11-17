import { describe, expect, it, vi } from 'vitest';
import { fetchConstraintData } from '@jamieblair/windforge-core';
import { GET } from '../src/app/api/designer/constraints/route';
import { createProject, EXAMPLE } from '../src/lib/designer/project';
import { evaluateLayout } from '../src/lib/designer/evaluate';
vi.mock('@jamieblair/windforge-core', async (original) => ({
  ...(await original<typeof import('@jamieblair/windforge-core')>()),
  fetchConstraintData: vi.fn(),
}));
const project = createProject(EXAMPLE);
function request(parcel: unknown) {
  return new Request(
    'https://windforge.test/api/designer/constraints?' +
      new URLSearchParams({ site: JSON.stringify(EXAMPLE), parcel: JSON.stringify(parcel) }),
  );
}
const ring = [...project.boundary, project.boundary[0]!].map((p) => [p.lng, p.lat]);
describe('parcel screening in the designer', () => {
  it('rejects unclosed parcels before contacting Overpass', async () => {
    expect((await GET(request(ring.slice(1)))).status).toBe(400);
    expect(fetchConstraintData).not.toHaveBeenCalled();
  });
  it('distinguishes an unavailable provider from an assessed empty parcel', async () => {
    vi.mocked(fetchConstraintData).mockRejectedValueOnce(new Error('timeout'));
    expect((await GET(request(ring))).status).toBe(502);
    vi.mocked(fetchConstraintData).mockResolvedValueOnce({ ok: true, value: { elements: [] } });
    const response = await GET(request(ring));
    expect(response.status).toBe(200);
    expect((await response.json()).zones).toEqual([]);
  });
  it('preserves exclusion holes and withholds yield only for layouts with conflicts', () => {
    const p = createProject(EXAMPLE),
      l = p.layouts[0]!;
    const first = l.positions[0]!,
      other = l.positions[1]!;
    const box = (centre: typeof first, d: number) =>
      [
        [-d, -d],
        [-d, d],
        [d, d],
        [d, -d],
      ].map(([lat, lng]) => ({ lat: centre.lat + lat!, lng: centre.lng + lng! }));
    p.screen = {
      at: new Date().toISOString(),
      summary: 'test',
      zones: [{ reason: 'test', areaSqKm: 1, polygon: box(first, 0.001) }],
    };
    expect(evaluateLayout(p, l)).toMatchObject({ energy: null, npv: null });
    expect(evaluateLayout(p, { ...l, positions: [other] }).energy).toBeGreaterThan(0);
    p.screen.zones[0]!.holes = [box(first, 0.0002)];
    expect(evaluateLayout(p, l).energy).toBeGreaterThan(0);
  });
});
