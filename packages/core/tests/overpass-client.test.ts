import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearConstraintCache,
  fetchConstraintData,
} from '../src/constraints/constraint-queries.js';
import { clearOverpassCaches, fetchLandUse } from '../src/datasources/osm-overpass.js';
import { queryOverpass } from '../src/datasources/overpass-client.js';
import type { SiteBoundary } from '../src/types/site.js';

const mockFetch = vi.fn();
const query = '[out:json][timeout:10];node(58.4,-3.6,58.5,-3.5);out body geom;';
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
  clearOverpassCaches();
  clearConstraintCache();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function hangUntilAborted(_url: string, init: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
  });
}

describe('Overpass provider failover', () => {
  it('preserves the mirror snapshot date through feature parsing and caching', async () => {
    mockFetch.mockResolvedValueOnce(
      response({ elements: [], osm3s: { timestamp_osm_base: '2026-08-10T00:10:23Z' } }),
    );
    const first = await fetchLandUse({ lat: 58.44, lng: -3.52 });
    expect(first).toMatchObject({
      ok: true,
      value: { osmBaseTimestamp: '2026-08-10T00:10:23.000Z' },
    });
    expect(await fetchLandUse({ lat: 58.44, lng: -3.52 })).toEqual(first);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('switches mirrors after a timeout and preserves complete geometry', async () => {
    const elements = [
      {
        type: 'way',
        id: 1,
        geometry: [
          { lat: 58.4, lon: -3.5 },
          { lat: 58.5, lon: -3.6 },
        ],
      },
    ];
    mockFetch
      .mockImplementationOnce(hangUntilAborted)
      .mockResolvedValueOnce(response({ elements }));
    const pending = queryOverpass(query);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await pending).toEqual({ ok: true, value: { elements } });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]![0]).not.toBe(mockFetch.mock.calls[0]![0]);
    expect(mockFetch.mock.calls[1]![1].body.get('data')).toBe(query);
  });

  it('finishes three stalled mirrors before the API deadline', async () => {
    mockFetch.mockImplementation(hangUntilAborted);
    const pending = queryOverpass(query);
    await vi.advanceTimersByTimeAsync(36_000);
    expect(await pending).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start a request for an already cancelled caller', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await queryOverpass(query, controller.signal)).toMatchObject({
      ok: false,
      error: { code: 'TIMEOUT' },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('stops immediately when the caller cancels, without starting a fallback', async () => {
    mockFetch.mockImplementation(hangUntilAborted);
    const controller = new AbortController();
    const pending = queryOverpass(query, controller.signal);
    controller.abort();
    expect(await pending).toMatchObject({
      ok: false,
      error: { message: 'Overpass query cancelled' },
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    406, 429, 502, 504,
  ])('fails over HTTP %s without resubmitting to the overloaded server', async (status) => {
    mockFetch
      .mockResolvedValueOnce(response({}, status))
      .mockResolvedValueOnce(response({ elements: [] }));
    expect(await queryOverpass(query)).toMatchObject({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]![0]).not.toBe(mockFetch.mock.calls[0]![0]);
  });

  it('does not retry a malformed query', async () => {
    mockFetch.mockResolvedValueOnce(response({}, 400));
    expect(await queryOverpass(query)).toMatchObject({
      ok: false,
      error: { code: 'DATA_FETCH_FAILED' },
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed JSON as a parse error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('not json'));
    expect(await queryOverpass(query)).toMatchObject({ ok: false, error: { code: 'PARSE_ERROR' } });
  });

  it('discards HTTP 200 partial results and uses complete fallback evidence', async () => {
    mockFetch
      .mockResolvedValueOnce(
        response({ elements: [{ type: 'node', id: 1 }], remark: 'runtime error: Query timed out' }),
      )
      .mockResolvedValueOnce(response({ elements: [{ type: 'node', id: 2 }] }));
    expect(await queryOverpass(query)).toEqual({
      ok: true,
      value: { elements: [{ type: 'node', id: 2 }] },
    });
  });

  it('does not cache a timed-out empty land-use response as a clear site', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(response({ elements: [], remark: 'runtime error: Query timed out' })),
    );
    expect(await fetchLandUse({ lat: 58.44, lng: -3.52 })).toMatchObject({ ok: false });
    mockFetch.mockResolvedValueOnce(response({ elements: [] }));
    expect(await fetchLandUse({ lat: 58.44, lng: -3.52 })).toMatchObject({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('applies the same incomplete-data protection to boundary constraints', async () => {
    const boundary = {
      boundingBox: { south: 58.43, west: -3.53, north: 58.45, east: -3.51 },
    } as SiteBoundary;
    mockFetch.mockImplementation(() =>
      Promise.resolve(response({ elements: [], remark: 'runtime error: out of memory' })),
    );
    expect(await fetchConstraintData(boundary)).toMatchObject({ ok: false });
    mockFetch.mockResolvedValueOnce(response({ elements: [] }));
    expect(await fetchConstraintData(boundary)).toMatchObject({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[3]![1].body.get('data')).toContain('out body geom;');
  });
});
