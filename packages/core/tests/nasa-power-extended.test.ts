import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchWindData,
  fetchMonthlyWindHistory,
  fetchDailyWindData,
  fetchHourlyWindData,
  clearWindDataCache,
} from '../src/datasources/nasa-power.js';

// Build a fake NASA POWER multi-height response
function fakeMultiHeightMonthlyResponse(startYear: number, endYear: number) {
  const ws2m: Record<string, number> = {};
  const ws10m: Record<string, number> = {};
  const ws50m: Record<string, number> = {};
  const wd10m: Record<string, number> = {};
  const wd50m: Record<string, number> = {};

  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const key = `${y}${String(m).padStart(2, '0')}`;
      ws2m[key] = 2.5 + m * 0.1;
      ws10m[key] = 4.0 + m * 0.15;
      ws50m[key] = 7.0 + m * 0.2;
      wd10m[key] = 200 + m;
      wd50m[key] = 210 + m;
    }
  }

  return {
    properties: {
      parameter: { WS2M: ws2m, WS10M: ws10m, WS50M: ws50m, WD10M: wd10m, WD50M: wd50m },
    },
  };
}

function fakeDailyResponse(startDate: string, endDate: string) {
  const ws2m: Record<string, number> = {};
  const ws10m: Record<string, number> = {};
  const ws50m: Record<string, number> = {};
  const wd10m: Record<string, number> = {};
  const wd50m: Record<string, number> = {};

  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    ws2m[key] = 3.0;
    ws10m[key] = 5.0;
    ws50m[key] = 8.0;
    wd10m[key] = 220;
    wd50m[key] = 230;
  }

  return {
    properties: {
      parameter: { WS2M: ws2m, WS10M: ws10m, WS50M: ws50m, WD10M: wd10m, WD50M: wd50m },
    },
  };
}

function fakeHourlyResponse() {
  const ws2m: Record<string, number> = {};
  const ws10m: Record<string, number> = {};
  const ws50m: Record<string, number> = {};
  const wd10m: Record<string, number> = {};
  const wd50m: Record<string, number> = {};

  // One day of hourly data
  for (let h = 0; h < 24; h++) {
    const key = `2023010${String(1)}${String(h).padStart(2, '0')}`; // 20230101HH
    ws2m[key] = 2 + h * 0.1;
    ws10m[key] = 4 + h * 0.2;
    ws50m[key] = 7 + h * 0.3;
    wd10m[key] = 200;
    wd50m[key] = 210;
  }

  return {
    properties: {
      parameter: { WS2M: ws2m, WS10M: ws10m, WS50M: ws50m, WD10M: wd10m, WD50M: wd50m },
    },
  };
}

beforeEach(() => {
  clearWindDataCache();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWindData (multi-height)', () => {
  it('uses 50m data when available', async () => {
    const response = fakeMultiHeightMonthlyResponse(2015, 2024);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);

    const result = await fetchWindData({ lat: 55, lng: -4 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.referenceHeightM).toBe(50);
      // Annual average should be around the ws50m values (7-9.4 range)
      expect(result.value.annualAverageSpeedMs).toBeGreaterThan(6);
    }
  });

  it('falls back to 2m when ws50m is missing', async () => {
    const response = fakeMultiHeightMonthlyResponse(2015, 2024);
    // Remove WS50M
    response.properties.parameter.WS50M = {};
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);

    const result = await fetchWindData({ lat: 55, lng: -4 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.referenceHeightM).toBe(2);
      expect(result.value.annualAverageSpeedMs).toBeLessThan(5);
    }
  });

  it('returns cached result on second call', async () => {
    const response = fakeMultiHeightMonthlyResponse(2015, 2024);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);

    await fetchWindData({ lat: 55, lng: -4 });
    await fetchWindData({ lat: 55, lng: -4 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects an incomplete climatology instead of inserting zero months', async () => {
    const response = fakeMultiHeightMonthlyResponse(2015, 2024);
    for (const values of Object.values(response.properties.parameter)) {
      for (const key of Object.keys(values)) {
        if (key.endsWith('02')) delete values[key];
      }
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);

    const result = await fetchWindData({ lat: 55, lng: -4 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('12 complete monthly');
  });
});

describe('fetchMonthlyWindHistory', () => {
  it('returns records with multi-height data', async () => {
    const response = fakeMultiHeightMonthlyResponse(2020, 2023);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);

    const result = await fetchMonthlyWindHistory({ lat: 55, lng: -4 }, 4);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.records.length).toBe(48); // 4 years × 12 months
      const rec = result.value.records[0]!;
      expect(rec.ws2m).toBeGreaterThan(0);
      expect(rec.ws10m).toBeGreaterThan(0);
      expect(rec.ws50m).toBeGreaterThan(0);
      expect(rec.wd10m).toBeGreaterThan(0);
      expect(rec.wd50m).toBeGreaterThan(0);
    }
  });

  it('records are sorted by date', async () => {
    const response = fakeMultiHeightMonthlyResponse(2020, 2023);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);

    const result = await fetchMonthlyWindHistory({ lat: 55, lng: -4 }, 4);
    if (result.ok) {
      for (let i = 1; i < result.value.records.length; i++) {
        const prev = result.value.records[i - 1]!;
        const curr = result.value.records[i]!;
        const prevKey = prev.year * 100 + prev.month;
        const currKey = curr.year * 100 + curr.month;
        expect(currKey).toBeGreaterThanOrEqual(prevKey);
      }
    }
  });

  it('represents unavailable heights as null rather than a numeric sentinel', async () => {
    const response = fakeMultiHeightMonthlyResponse(2020, 2020);
    response.properties.parameter.WS50M = {};
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);

    const result = await fetchMonthlyWindHistory({ lat: 55, lng: -4 }, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.records[0]?.ws50m).toBeNull();
  });

  it('handles API failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const result = await fetchMonthlyWindHistory({ lat: 55, lng: -4 });
    expect(result.ok).toBe(false);
  });
});

describe('fetchDailyWindData', () => {
  it('returns daily records', async () => {
    const response = fakeDailyResponse('2023-01-01', '2023-01-10');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);

    const result = await fetchDailyWindData({ lat: 55, lng: -4 }, '2023-01-01', '2023-01-10');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.records.length).toBe(10);
      const rec = result.value.records[0]!;
      expect(rec.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rec.ws50m).toBe(8);
    }
  });

  it('records have correct date format', async () => {
    const response = fakeDailyResponse('2023-06-01', '2023-06-05');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);

    const result = await fetchDailyWindData({ lat: 55, lng: -4 }, '2023-06-01', '2023-06-05');
    if (result.ok) {
      for (const rec of result.value.records) {
        expect(rec.date).toMatch(/^2023-06-0[1-5]$/);
      }
    }
  });
});

describe('fetchHourlyWindData', () => {
  it('returns hourly records', async () => {
    const response = fakeHourlyResponse();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);

    const result = await fetchHourlyWindData({ lat: 55, lng: -4 }, '2023-01-01', '2023-01-01');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.records.length).toBe(24);
      const rec = result.value.records[0]!;
      expect(rec.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/);
    }
  });

  it('caches hourly data', async () => {
    const response = fakeHourlyResponse();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);

    await fetchHourlyWindData({ lat: 55, lng: -4 }, '2023-01-01', '2023-01-01');
    await fetchHourlyWindData({ lat: 55, lng: -4 }, '2023-01-01', '2023-01-01');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('handles parse errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('Bad JSON');
      },
    } as Response);

    const result = await fetchHourlyWindData({ lat: 55, lng: -4 }, '2023-01-01', '2023-01-01');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('parse');
    }
  });
});

describe('clearWindDataCache', () => {
  it('clears all caches', async () => {
    const response = fakeMultiHeightMonthlyResponse(2020, 2023);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);

    await fetchWindData({ lat: 55, lng: -4 });
    clearWindDataCache();
    await fetchWindData({ lat: 55, lng: -4 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
