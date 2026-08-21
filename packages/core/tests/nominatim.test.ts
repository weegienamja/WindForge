import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reverseGeocode, clearGeocodeCache } from '../src/datasources/nominatim.js';

const mockFetch = vi.fn();

beforeEach(() => {
  clearGeocodeCache(); // also resets rate limiter
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function nominatimResponse(address: Record<string, string>, displayName: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ address, display_name: displayName }),
  };
}

describe('reverseGeocode', () => {
  it('returns country code and region from Nominatim response', async () => {
    mockFetch.mockResolvedValueOnce(
      nominatimResponse(
        { country_code: 'gb', country: 'United Kingdom', state: 'Scotland' },
        'Glasgow, Scotland, United Kingdom',
      ),
    );

    const result = await reverseGeocode({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.countryCode).toBe('GB');
      expect(result.value.country).toBe('United Kingdom');
      expect(result.value.region).toBe('Scotland');
      expect(result.value.displayName).toBe('Glasgow, Scotland, United Kingdom');
    }
  });

  it('uppercases country code', async () => {
    mockFetch.mockResolvedValueOnce(
      nominatimResponse(
        { country_code: 'de', country: 'Germany', state: 'Bavaria' },
        'Munich, Germany',
      ),
    );

    const result = await reverseGeocode({ lat: 48.14, lng: 11.58 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.countryCode).toBe('DE');
    }
  });

  it('falls back to county/region when state is missing', async () => {
    mockFetch.mockResolvedValueOnce(
      nominatimResponse(
        { country_code: 'gb', country: 'United Kingdom', county: 'Highland' },
        'Inverness, Highland, UK',
      ),
    );

    const result = await reverseGeocode({ lat: 57.48, lng: -4.22 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.region).toBe('Highland');
    }
  });

  it('handles missing address fields gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ display_name: 'Unknown Location' }),
    });

    const result = await reverseGeocode({ lat: 0, lng: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.countryCode).toBe('');
      expect(result.value.country).toBe('');
      expect(result.value.region).toBe('');
      expect(result.value.displayName).toBe('Unknown Location');
    }
  });

  it('returns error on HTTP failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.resolve({}) });

    const result = await reverseGeocode({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DATA_FETCH_FAILED');
      expect(result.error.message).toContain('503');
    }
  });

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await reverseGeocode({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DATA_FETCH_FAILED');
    }
  });

  it('uses cache on repeated calls', async () => {
    mockFetch.mockResolvedValueOnce(
      nominatimResponse({ country_code: 'gb', country: 'UK', state: 'Scotland' }, 'Glasgow, UK'),
    );

    const coord = { lat: 55.86, lng: -4.25 };
    await reverseGeocode({ lat: 55.86, lng: -4.25 });
    await reverseGeocode({ lat: 55.86, lng: -4.25 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sends User-Agent header', async () => {
    mockFetch.mockResolvedValueOnce(nominatimResponse({ country_code: 'gb', country: 'UK' }, 'UK'));

    await reverseGeocode({ lat: 55.86, lng: -4.25 });
    const fetchCall = mockFetch.mock.calls[0]!;
    const options = fetchCall[1] as { headers: Record<string, string> };
    expect(options.headers['User-Agent']).toContain('WindSiteIntelligence');
  });
});

describe('clearGeocodeCache', () => {
  it('clears cache so subsequent calls refetch', async () => {
    mockFetch.mockResolvedValue(nominatimResponse({ country_code: 'gb', country: 'UK' }, 'UK'));

    const coord = { lat: 55.86, lng: -4.25 };
    await reverseGeocode({ lat: 55.86, lng: -4.25 });
    clearGeocodeCache();
    await reverseGeocode({ lat: 55.86, lng: -4.25 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
