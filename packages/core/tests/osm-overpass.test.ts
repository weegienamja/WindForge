import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchGridInfrastructure,
  fetchLandUse,
  fetchRoadAccess,
  fetchNearbyWindFarms,
  clearOverpassCaches,
} from '../src/datasources/osm-overpass.js';

// Mock global fetch
const mockFetch = vi.fn();
beforeEach(() => {
  clearOverpassCaches();
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function overpassResponse(elements: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ elements }),
  };
}

function failedResponse(status: number) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
  };
}

describe('fetchGridInfrastructure', () => {
  it('returns grid data with lines and substations', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        {
          type: 'way',
          id: 1,
          center: { lat: 55.87, lon: -4.24 },
          tags: { power: 'line', voltage: '132000' },
        },
        { type: 'node', id: 2, lat: 55.88, lon: -4.23, tags: { power: 'substation' } },
      ]),
    );

    const result = await fetchGridInfrastructure({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lineCount).toBe(1);
      expect(result.value.substationCount).toBe(1);
      expect(result.value.nearestLineDistanceKm).toBeGreaterThan(0);
      expect(result.value.nearestSubstationDistanceKm).toBeGreaterThan(0);
    }
  });

  it('returns -1 sentinel when no infrastructure found', async () => {
    // First call with 50km returns nothing, second call with 100km also returns nothing
    mockFetch.mockResolvedValue(overpassResponse([]));

    const result = await fetchGridInfrastructure({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nearestLineDistanceKm).toBe(-1);
      expect(result.value.nearestSubstationDistanceKm).toBe(-1);
      expect(result.value.lineCount).toBe(0);
      expect(result.value.substationCount).toBe(0);
      expect(result.value.searchRadiusKm).toBe(100); // expanded search
    }
  });

  it('expands search radius to 100km when 50km returns nothing', async () => {
    mockFetch
      .mockResolvedValueOnce(overpassResponse([])) // 50km search
      .mockResolvedValueOnce(
        overpassResponse([
          {
            type: 'way',
            id: 1,
            center: { lat: 56.5, lon: -4.24 },
            tags: { power: 'line', voltage: '400000' },
          },
        ]),
      ); // 100km search

    const result = await fetchGridInfrastructure({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.searchRadiusKm).toBe(100);
      expect(result.value.lineCount).toBe(1);
    }
  });

  it('returns error on HTTP failure', async () => {
    mockFetch.mockResolvedValueOnce(failedResponse(503)).mockResolvedValueOnce(failedResponse(503)); // retry also fails

    const resultPromise = fetchGridInfrastructure({ lat: 55.86, lng: -4.25 });
    await vi.advanceTimersByTimeAsync(6000); // advance past 5s retry delay
    const result = await resultPromise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DATA_FETCH_FAILED');
    }
  });

  it('retries once on failure', async () => {
    mockFetch
      .mockResolvedValueOnce(failedResponse(429)) // rate limited
      .mockResolvedValueOnce(
        overpassResponse([
          { type: 'node', id: 3, lat: 55.87, lon: -4.24, tags: { power: 'substation' } },
        ]),
      );

    const resultPromise = fetchGridInfrastructure({ lat: 55.86, lng: -4.25 });
    await vi.advanceTimersByTimeAsync(6000); // advance past 5s retry delay
    const result = await resultPromise;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.substationCount).toBe(1);
    }
  });

  it('uses cache on repeated calls', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        {
          type: 'way',
          id: 1,
          center: { lat: 55.87, lon: -4.24 },
          tags: { power: 'line', voltage: '132000' },
        },
      ]),
    );

    const coord = { lat: 55.86, lng: -4.25 };
    await fetchGridInfrastructure(coord);
    await fetchGridInfrastructure(coord);
    // Only one fetch call (second should hit cache)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('skips elements without coordinates', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        { type: 'way', id: 1, tags: { power: 'line', voltage: '132000' } }, // no coords
        { type: 'node', id: 2, lat: 55.87, lon: -4.24, tags: { power: 'substation' } },
      ]),
    );

    const result = await fetchGridInfrastructure({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.substationCount).toBe(1);
      expect(result.value.lineCount).toBe(0); // element without coords skipped
    }
  });
});

describe('fetchLandUse', () => {
  it('detects hard constraints', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        {
          type: 'way',
          id: 1,
          center: { lat: 55.86, lon: -4.25 },
          tags: { leisure: 'nature_reserve' },
        },
      ]),
    );

    const result = await fetchLandUse({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hardConstraints).toHaveLength(1);
      expect(result.value.hardConstraints[0]!.type).toBe('nature_reserve');
    }
  });

  it('detects protected_area hard constraint', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        {
          type: 'relation',
          id: 1,
          center: { lat: 55.86, lon: -4.25 },
          tags: { boundary: 'protected_area' },
        },
      ]),
    );

    const result = await fetchLandUse({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hardConstraints.some((hc) => hc.type === 'protected_area')).toBe(true);
    }
  });

  it('detects military hard constraint', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        { type: 'way', id: 1, center: { lat: 55.86, lon: -4.25 }, tags: { landuse: 'military' } },
      ]),
    );

    const result = await fetchLandUse({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hardConstraints.some((hc) => hc.type === 'military')).toBe(true);
    }
  });

  it('detects aeroway hard constraint', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        { type: 'way', id: 1, center: { lat: 55.86, lon: -4.25 }, tags: { aeroway: 'runway' } },
      ]),
    );

    const result = await fetchLandUse({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hardConstraints.some((hc) => hc.type === 'aeroway')).toBe(true);
    }
  });

  it('detects residential as soft constraint when close', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        {
          type: 'way',
          id: 1,
          center: { lat: 55.861, lon: -4.25 },
          tags: { landuse: 'residential' },
        },
      ]),
    );

    const result = await fetchLandUse({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The residential area at ~0.1km should be within 0.5km threshold
      expect(result.value.softConstraints.some((sc) => sc.type === 'residential')).toBe(true);
    }
  });

  it('detects positive indicators (farmland)', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        { type: 'way', id: 1, center: { lat: 55.86, lon: -4.25 }, tags: { landuse: 'farmland' } },
      ]),
    );

    const result = await fetchLandUse({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.positiveIndicators).toContain('Farmland');
    }
  });

  it('detects positive indicators (heathland)', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        { type: 'node', id: 1, lat: 55.86, lon: -4.25, tags: { natural: 'heath' } },
      ]),
    );

    const result = await fetchLandUse({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.positiveIndicators).toContain('Heathland');
    }
  });

  it('deduplicates positive indicators', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        { type: 'way', id: 1, center: { lat: 55.86, lon: -4.25 }, tags: { landuse: 'farmland' } },
        { type: 'way', id: 2, center: { lat: 55.861, lon: -4.25 }, tags: { landuse: 'farmland' } },
      ]),
    );

    const result = await fetchLandUse({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const farmCount = result.value.positiveIndicators.filter((p) => p === 'Farmland').length;
      expect(farmCount).toBe(1);
    }
  });

  it('returns empty arrays when no land use data found', async () => {
    mockFetch.mockResolvedValueOnce(overpassResponse([]));

    const result = await fetchLandUse({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hardConstraints).toHaveLength(0);
      expect(result.value.softConstraints).toHaveLength(0);
      expect(result.value.positiveIndicators).toHaveLength(0);
    }
  });
});

describe('fetchRoadAccess', () => {
  it('categorises primary roads correctly', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        { type: 'way', id: 1, center: { lat: 55.87, lon: -4.24 }, tags: { highway: 'primary' } },
      ]),
    );

    const result = await fetchRoadAccess({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.bestRoadCategory).toBe('primary');
      expect(result.value.nearestMajorRoadDistanceKm).toBeGreaterThan(0);
    }
  });

  it('categorises secondary roads correctly', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        { type: 'way', id: 1, center: { lat: 55.87, lon: -4.24 }, tags: { highway: 'secondary' } },
      ]),
    );

    const result = await fetchRoadAccess({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.bestRoadCategory).toBe('secondary');
      expect(result.value.secondaryRoadCount).toBe(1);
    }
  });

  it('categorises minor roads (track/unclassified)', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        { type: 'way', id: 1, center: { lat: 55.87, lon: -4.24 }, tags: { highway: 'track' } },
      ]),
    );

    const result = await fetchRoadAccess({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.bestRoadCategory).toBe('minor');
    }
  });

  it('returns no-roads result when empty', async () => {
    mockFetch.mockResolvedValueOnce(overpassResponse([]));

    const result = await fetchRoadAccess({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.bestRoadCategory).toBe('none');
      expect(result.value.nearestMajorRoadDistanceKm).toBe(-1);
      expect(result.value.nearestSecondaryRoadDistanceKm).toBe(-1);
    }
  });

  it('picks best category when multiple road types present', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        { type: 'way', id: 1, center: { lat: 55.87, lon: -4.24 }, tags: { highway: 'track' } },
        { type: 'way', id: 2, center: { lat: 55.88, lon: -4.23 }, tags: { highway: 'primary' } },
        {
          type: 'way',
          id: 3,
          center: { lat: 55.865, lon: -4.245 },
          tags: { highway: 'secondary' },
        },
      ]),
    );

    const result = await fetchRoadAccess({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.bestRoadCategory).toBe('primary');
    }
  });
});

describe('fetchNearbyWindFarms', () => {
  it('returns wind farms sorted by distance', async () => {
    mockFetch.mockResolvedValueOnce(
      overpassResponse([
        { type: 'node', id: 1, lat: 55.9, lon: -4.2, tags: { 'generator:source': 'wind' } },
        { type: 'node', id: 2, lat: 55.87, lon: -4.24, tags: { 'generator:source': 'wind' } },
      ]),
    );

    const result = await fetchNearbyWindFarms({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]!.distanceKm).toBeLessThan(result.value[1]!.distanceKm);
    }
  });

  it('returns empty array when no wind farms found', async () => {
    mockFetch.mockResolvedValueOnce(overpassResponse([]));

    const result = await fetchNearbyWindFarms({ lat: 55.86, lng: -4.25 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('handles fetch failure gracefully', async () => {
    mockFetch.mockResolvedValueOnce(failedResponse(500)).mockResolvedValueOnce(failedResponse(500));

    const resultPromise = fetchNearbyWindFarms({ lat: 55.86, lng: -4.25 });
    await vi.advanceTimersByTimeAsync(6000); // advance past 5s retry delay
    const result = await resultPromise;
    expect(result.ok).toBe(false);
  });
});

describe('clearOverpassCaches', () => {
  it('clears cache so subsequent calls refetch', async () => {
    mockFetch.mockResolvedValue(overpassResponse([]));

    const coord = { lat: 55.86, lng: -4.25 };
    await fetchNearbyWindFarms(coord);
    clearOverpassCaches();
    await fetchNearbyWindFarms(coord);
    // Two separate fetch calls (cache was cleared)
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
