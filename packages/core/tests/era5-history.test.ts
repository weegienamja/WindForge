import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchEra5MonthlyHistory,
  parseEra5NetCdf,
  clearEra5Cache,
} from '../src/datasources/era5.js';
import { ScoringErrorCode } from '../src/types/errors.js';

// ─── Mock netcdfjs ─────────────────────────────────────────────
// The real CDS API returns NetCDF binary data. Tests inject a
// fake reader so the orchestration logic can be exercised without
// crafting real NetCDF bytes.

let mockNetCdfData: {
  variables: Array<{ name: string }>;
  data: Record<string, number[]>;
} = {
  variables: [],
  data: {},
};

vi.mock('netcdfjs', () => ({
  NetCDFReader: class {
    variables = mockNetCdfData.variables;
    getDataVariable(name: string): number[] {
      const v = mockNetCdfData.data[name];
      if (!v) throw new Error(`unknown var ${name}`);
      return v;
    }
  },
}));

// ─── Helpers ───────────────────────────────────────────────────

const COORD = { lat: 55.86, lng: -4.25 };

interface MockResponse {
  status: number;
  body?: unknown;
  bodyBuffer?: ArrayBuffer;
}

function mockFetchSequence(responses: MockResponse[]): ReturnType<typeof vi.fn> {
  let i = 0;
  const fn = vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return new Response(
      r?.bodyBuffer ?? (r?.body !== undefined ? JSON.stringify(r.body) : null),
      { status: r?.status ?? 200 },
    );
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function setMockNetCdf(records: Array<{ year: number; month: number; speed: number }>): void {
  // Build a single-cell grid (1 lat × 1 lng × N times). For a 100m height
  // request the parser reads u100 and v100; we encode speed as u with v=0.
  const times = records.map((r) => hoursSince1900(r.year, r.month));
  const u = records.map((r) => r.speed);
  const v = records.map(() => 0);
  mockNetCdfData = {
    variables: [
      { name: 'time' },
      { name: 'latitude' },
      { name: 'longitude' },
      { name: 'u100' },
      { name: 'v100' },
      { name: 'u10' },
      { name: 'v10' },
    ],
    data: {
      time: times,
      latitude: [55.86],
      longitude: [-4.25],
      u100: u,
      v100: v,
      u10: u,
      v10: v,
    },
  };
}

function hoursSince1900(year: number, month: number): number {
  const ms = Date.UTC(year, month - 1, 1) - Date.UTC(1900, 0, 1);
  return ms / (3600 * 1000);
}

// ─── Tests ─────────────────────────────────────────────────────

describe('fetchEra5MonthlyHistory', () => {
  beforeEach(() => {
    clearEra5Cache();
    vi.useRealTimers();
    delete process.env.CDS_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns Configuration error when API key missing', async () => {
    const result = await fetchEra5MonthlyHistory(COORD, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.Configuration);
    }
  });

  it('returns Configuration error when API key is whitespace', async () => {
    const result = await fetchEra5MonthlyHistory(COORD, { cdsApiKey: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.Configuration);
  });

  it('returns OutOfRange when startYear > endYear', async () => {
    const result = await fetchEra5MonthlyHistory(COORD, {
      cdsApiKey: 'k',
      startYear: 2020,
      endYear: 2010,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.OutOfRange);
  });

  it('reads CDS_API_KEY from environment', async () => {
    process.env.CDS_API_KEY = 'env-key';
    setMockNetCdf([{ year: 2020, month: 1, speed: 8.0 }]);
    const fetchMock = mockFetchSequence([
      { status: 200, body: { state: 'completed', request_id: 'r1', location: 'http://download/file' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    const result = await fetchEra5MonthlyHistory(COORD, {
      startYear: 2020,
      endYear: 2020,
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    const firstCallHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers as Record<string, string>;
    expect(firstCallHeaders.Authorization).toBe('Bearer env-key');
  });

  it('returns ReanalysisSource on happy path (immediate completion)', async () => {
    setMockNetCdf([
      { year: 2020, month: 1, speed: 9.0 },
      { year: 2020, month: 2, speed: 7.5 },
      { year: 2020, month: 3, speed: 8.2 },
    ]);
    mockFetchSequence([
      { status: 200, body: { state: 'completed', request_id: 'r1', location: 'http://download/file' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    const result = await fetchEra5MonthlyHistory(COORD, {
      cdsApiKey: 'key',
      startYear: 2020,
      endYear: 2020,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.history.records).toHaveLength(3);
      expect(result.value.summary.referenceHeightM).toBe(100);
      expect(result.value.summary.annualAverageSpeedMs).toBeGreaterThan(7);
      expect(result.value.summary.annualAverageSpeedMs).toBeLessThan(10);
    }
  });

  it('caches results across calls', async () => {
    setMockNetCdf([{ year: 2020, month: 1, speed: 8.0 }]);
    const fetchMock = mockFetchSequence([
      { status: 200, body: { state: 'completed', request_id: 'r1', location: 'http://d/x' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    const first = await fetchEra5MonthlyHistory(COORD, {
      cdsApiKey: 'key',
      startYear: 2020,
      endYear: 2020,
    });
    const callsAfterFirst = fetchMock.mock.calls.length;
    const second = await fetchEra5MonthlyHistory(COORD, {
      cdsApiKey: 'key',
      startYear: 2020,
      endYear: 2020,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    // second call should not perform any new fetches
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('cache key respects ~25km grid (nearby coords share cache)', async () => {
    setMockNetCdf([{ year: 2020, month: 1, speed: 8.0 }]);
    const fetchMock = mockFetchSequence([
      { status: 200, body: { state: 'completed', request_id: 'r1', location: 'http://d/x' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    await fetchEra5MonthlyHistory(COORD, { cdsApiKey: 'key', startYear: 2020, endYear: 2020 });
    const callsAfterFirst = fetchMock.mock.calls.length;
    // 0.01° offset rounds into the same 0.25° grid cell
    await fetchEra5MonthlyHistory(
      { lat: COORD.lat + 0.01, lng: COORD.lng - 0.01 },
      { cdsApiKey: 'key', startYear: 2020, endYear: 2020 },
    );
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('returns DataFetchFailed on CDS submission HTTP error', async () => {
    mockFetchSequence([{ status: 401, body: { error: 'unauthorised' } }]);
    const result = await fetchEra5MonthlyHistory(COORD, {
      cdsApiKey: 'bad',
      startYear: 2020,
      endYear: 2020,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.DataFetchFailed);
  });

  it('returns DataFetchFailed when CDS reports task failed during submission', async () => {
    mockFetchSequence([
      { status: 200, body: { state: 'failed', error: { reason: 'no data for area' } } },
    ]);
    const result = await fetchEra5MonthlyHistory(COORD, {
      cdsApiKey: 'k',
      startYear: 2020,
      endYear: 2020,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.DataFetchFailed);
      expect(result.error.message).toContain('no data');
    }
  });

  it('polls until completion', async () => {
    setMockNetCdf([{ year: 2020, month: 1, speed: 8.0 }]);
    mockFetchSequence([
      { status: 200, body: { state: 'queued', request_id: 'r99' } },
      { status: 200, body: { state: 'running', request_id: 'r99' } },
      { status: 200, body: { state: 'completed', location: 'http://d/file' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    const result = await fetchEra5MonthlyHistory(COORD, {
      cdsApiKey: 'k',
      startYear: 2020,
      endYear: 2020,
      pollIntervalSeconds: 0,
      maxPollSeconds: 10,
    });
    expect(result.ok).toBe(true);
  });

  it('returns Timeout when polling exceeds maxPollSeconds', async () => {
    mockFetchSequence([
      { status: 200, body: { state: 'queued', request_id: 'r99' } },
      { status: 200, body: { state: 'running', request_id: 'r99' } },
      { status: 200, body: { state: 'running', request_id: 'r99' } },
      { status: 200, body: { state: 'running', request_id: 'r99' } },
    ]);
    const result = await fetchEra5MonthlyHistory(COORD, {
      cdsApiKey: 'k',
      startYear: 2020,
      endYear: 2020,
      pollIntervalSeconds: 0,
      maxPollSeconds: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.Timeout);
  });

  it('returns DataFetchFailed when poll reports failure', async () => {
    mockFetchSequence([
      { status: 200, body: { state: 'queued', request_id: 'r99' } },
      { status: 200, body: { state: 'failed', error: { message: 'queue overflow' } } },
    ]);
    const result = await fetchEra5MonthlyHistory(COORD, {
      cdsApiKey: 'k',
      startYear: 2020,
      endYear: 2020,
      pollIntervalSeconds: 0,
      maxPollSeconds: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.DataFetchFailed);
      expect(result.error.message).toContain('queue overflow');
    }
  });

  it('returns InsufficientData when NetCDF has zero records', async () => {
    setMockNetCdf([]);
    mockFetchSequence([
      { status: 200, body: { state: 'completed', request_id: 'r', location: 'http://d/x' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    const result = await fetchEra5MonthlyHistory(COORD, {
      cdsApiKey: 'k',
      startYear: 2020,
      endYear: 2020,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.InsufficientData);
  });

  it('uses 10m variables when heightM=10', async () => {
    setMockNetCdf([{ year: 2020, month: 1, speed: 6.0 }]);
    const fetchMock = mockFetchSequence([
      { status: 200, body: { state: 'completed', request_id: 'r', location: 'http://d/x' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    const result = await fetchEra5MonthlyHistory(COORD, {
      cdsApiKey: 'k',
      heightM: 10,
      startYear: 2020,
      endYear: 2020,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary.referenceHeightM).toBe(10);
      expect(result.value.history.records[0]?.ws10m).toBeCloseTo(6.0, 1);
    }
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.variable).toContain('10m_u_component_of_wind');
    expect(body.variable).toContain('10m_v_component_of_wind');
  });

  it('default year range covers about 10 years', async () => {
    setMockNetCdf([{ year: 2020, month: 1, speed: 8.0 }]);
    const fetchMock = mockFetchSequence([
      { status: 200, body: { state: 'completed', request_id: 'r', location: 'http://d/x' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    const result = await fetchEra5MonthlyHistory(COORD, { cdsApiKey: 'k' });
    expect(result.ok).toBe(true);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.year.length).toBe(10);
  });
});

describe('parseEra5NetCdf', () => {
  it('produces records sorted by year and month', () => {
    setMockNetCdf([
      { year: 2020, month: 3, speed: 7.0 },
      { year: 2020, month: 1, speed: 9.0 },
      { year: 2019, month: 12, speed: 8.0 },
    ]);
    const result = parseEra5NetCdf(new ArrayBuffer(8), COORD, 100);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((r) => `${r.year}-${r.month}`)).toEqual([
        '2019-12',
        '2020-1',
        '2020-3',
      ]);
    }
  });

  it('computes wind speed via sqrt(u^2 + v^2)', () => {
    mockNetCdfData = {
      variables: [
        { name: 'time' },
        { name: 'latitude' },
        { name: 'longitude' },
        { name: 'u100' },
        { name: 'v100' },
      ],
      data: {
        time: [hoursSince1900(2020, 1)],
        latitude: [55.86],
        longitude: [-4.25],
        u100: [3],
        v100: [4],
      },
    };
    const result = parseEra5NetCdf(new ArrayBuffer(8), COORD, 100);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.ws50m).toBeCloseTo(5, 5);
    }
  });

  it('returns ParseError when u/v variables missing', () => {
    mockNetCdfData = {
      variables: [{ name: 'time' }, { name: 'latitude' }, { name: 'longitude' }],
      data: { time: [0], latitude: [55], longitude: [-4] },
    };
    const result = parseEra5NetCdf(new ArrayBuffer(8), COORD, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.ParseError);
  });

  it('returns InsufficientData when axes empty', () => {
    mockNetCdfData = {
      variables: [
        { name: 'time' },
        { name: 'latitude' },
        { name: 'longitude' },
        { name: 'u100' },
        { name: 'v100' },
      ],
      data: { time: [], latitude: [], longitude: [], u100: [], v100: [] },
    };
    const result = parseEra5NetCdf(new ArrayBuffer(8), COORD, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.InsufficientData);
  });
});
