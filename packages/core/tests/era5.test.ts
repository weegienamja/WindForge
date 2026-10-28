import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearEra5Cache,
  fetchEra5WindData,
  uvToSpeedDirection,
  validateEra5ApiKey,
} from '../src/datasources/era5.js';

describe('ERA5 Data Source', () => {
  beforeEach(() => {
    clearEra5Cache();
    vi.restoreAllMocks();
  });

  it('rejects empty API key', async () => {
    const result = await fetchEra5WindData({ lat: 55, lng: -4 }, '');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('API key is required');
    }
  });

  it('rejects whitespace-only API key', async () => {
    const result = await fetchEra5WindData({ lat: 55, lng: -4 }, '   ');
    expect(result.ok).toBe(false);
  });

  it('validates API key returns false for empty key', async () => {
    const result = await validateEra5ApiKey('');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(false);
    }
  });

  it('validates the token with the authenticated profile endpoint', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    expect(await validateEra5ApiKey(' test-token ')).toEqual({ ok: true, value: true });
    expect(fetch).toHaveBeenCalledWith(
      'https://cds.climate.copernicus.eu/api/profiles/v1/account/verification/pat',
      expect.objectContaining({ method: 'POST', headers: { 'PRIVATE-TOKEN': 'test-token' } }),
    );
  });

  it.each([401, 403])('reports a rejected credential for HTTP %s', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status }));
    expect(await validateEra5ApiKey('test-token')).toEqual({ ok: true, value: false });
  });

  it('distinguishes provider failure from an invalid key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 503 }));
    expect(await validateEra5ApiKey('test-token')).toMatchObject({
      ok: false,
      error: { code: 'DATA_FETCH_FAILED' },
    });
  });

  it('does not expose request credentials in network errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('test-token'));
    const result = await validateEra5ApiKey('test-token');
    expect(result).toMatchObject({ ok: false, error: { code: 'DATA_FETCH_FAILED' } });
    expect(JSON.stringify(result)).not.toContain('test-token');
  });

  describe('uvToSpeedDirection', () => {
    it('converts zero wind to 0 speed and direction', () => {
      const result = uvToSpeedDirection(0, 0);
      expect(result.speedMs).toBe(0);
      expect(result.directionDeg).toBe(0);
    });

    it('converts pure eastward wind (u > 0, v = 0) to westerly direction (270)', () => {
      const result = uvToSpeedDirection(5, 0);
      expect(result.speedMs).toBeCloseTo(5, 1);
      expect(result.directionDeg).toBeCloseTo(270, 0);
    });

    it('converts pure northward wind (u = 0, v > 0) to southerly direction (180)', () => {
      const result = uvToSpeedDirection(0, 5);
      expect(result.speedMs).toBeCloseTo(5, 1);
      expect(result.directionDeg).toBeCloseTo(180, 0);
    });

    it('converts pure southward wind (u = 0, v < 0) to northerly direction (0/360)', () => {
      const result = uvToSpeedDirection(0, -5);
      expect(result.speedMs).toBeCloseTo(5, 1);
      // Should be 0 or 360 (northerly)
      expect(result.directionDeg % 360).toBeCloseTo(0, 0);
    });

    it('calculates correct speed for diagonal wind', () => {
      const result = uvToSpeedDirection(3, 4);
      expect(result.speedMs).toBeCloseTo(5, 1);
    });
  });
});
