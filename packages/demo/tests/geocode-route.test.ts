import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../src/app/api/geocode/route';

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(payload),
    }),
  );
}

function req(qs: string): Request {
  return new Request(`https://windforge.test/api/geocode${qs}`);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/api/geocode', () => {
  it('returns an empty result set for a too-short query without calling upstream', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await GET(req('?q=a'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps forward search results and builds a compact label', async () => {
    mockFetchOnce([
      {
        display_name: 'Stornoway, Western Isles, Scotland, United Kingdom',
        lat: '58.2090',
        lon: '-6.3890',
        category: 'place',
      },
      { display_name: 'No coords', lat: 'x', lon: 'y' },
    ]);
    const res = await GET(req('?q=Stornoway'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ lat: 58.209, lng: -6.389, category: 'place' });
    expect(body.results[0].label).toBe('Stornoway, Scotland, United Kingdom');
  });

  it('reverse-geocodes a coordinate to a label', async () => {
    mockFetchOnce({ display_name: 'Caithness, Highland, Scotland, United Kingdom' });
    const res = await GET(req('?lat=58.44&lng=-3.52'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.displayName).toContain('Caithness');
    expect(body.label).toBe('Caithness, Scotland, United Kingdom');
  });

  it('rejects an invalid reverse coordinate', async () => {
    const res = await GET(req('?lat=abc&lng=def'));
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('rejects blank reverse coordinates before contacting the provider', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    for (const query of ['?lat=&lng=', '?lat=%20&lng=0', '?lat=0&lng=%20']) {
      expect((await GET(req(query))).status).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('filters malformed provider rows without inventing zero coordinates', async () => {
    mockFetchOnce([
      { display_name: 'Valid', lat: '0', lon: '0' },
      { display_name: 'Missing', lat: null, lon: null },
      { display_name: 'Blank', lat: '', lon: ' ' },
      { display_name: 'Outside', lat: '91', lon: '181' },
      { display_name: {}, lat: '1', lon: '2' },
      null,
    ]);
    const response = await GET(req('?q=Test'));
    expect(response.status).toBe(200);
    expect((await response.json()).results).toEqual([
      { displayName: 'Valid', label: 'Valid', category: '', lat: 0, lng: 0 },
    ]);
  });

  it('rejects out-of-range coordinates and oversized queries', async () => {
    expect((await GET(req('?lat=91&lng=0'))).status).toBe(400);
    expect((await GET(req(`?q=${'x'.repeat(121)}`))).status).toBe(400);
  });

  it('requires either q or lat/lng', async () => {
    const res = await GET(req(''));
    expect(res.status).toBe(400);
  });

  it('surfaces upstream failures as 502', async () => {
    mockFetchOnce([], false, 503);
    const res = await GET(req('?q=Stornoway'));
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('does not cache malformed provider payloads or timeouts as successful lookups', async () => {
    mockFetchOnce({ error: 'Invalid response shape' });
    const malformed = await GET(req('?q=Test'));
    expect(malformed.status).toBe(502);
    expect(malformed.headers.get('cache-control')).toContain('no-store');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError')),
    );
    expect((await GET(req('?q=Test'))).status).toBe(504);
  });
});
