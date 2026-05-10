import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchCerraMonthlyHistory,
  parseCerraNetCdf,
  clearCerraCache,
} from '../src/datasources/cerra.js';
import { ScoringErrorCode } from '../src/types/errors.js';

let mockNetCdfData: {
  variables: Array<{ name: string }>;
  data: Record<string, number[]>;
} = { variables: [], data: {} };

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

const COORD_EU = { lat: 55.7644, lng: -4.1770 };
const COORD_AU = { lat: -33.86, lng: 151.21 };

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
  const times = records.map((r) => hoursSince1900(r.year, r.month));
  mockNetCdfData = {
    variables: [
      { name: 'time' },
      { name: 'latitude' },
      { name: 'longitude' },
      { name: 'si10' },
    ],
    data: {
      time: times,
      latitude: [COORD_EU.lat],
      longitude: [COORD_EU.lng],
      si10: records.map((r) => r.speed),
    },
  };
}

function hoursSince1900(year: number, month: number): number {
  const ms = Date.UTC(year, month - 1, 1) - Date.UTC(1900, 0, 1);
  return ms / (3600 * 1000);
}

describe('fetchCerraMonthlyHistory', () => {
  beforeEach(() => {
    clearCerraCache();
    delete process.env.CDS_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects out-of-area coordinates without HTTP calls', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await fetchCerraMonthlyHistory(COORD_AU, { cdsApiKey: 'k' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.OutOfRange);
      expect(result.error.message).toContain('Europe');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts in-area coordinates and proceeds with fetch', async () => {
    setMockNetCdf([{ year: 2020, month: 1, speed: 6.5 }]);
    mockFetchSequence([
      { status: 200, body: { state: 'completed', request_id: 'r', location: 'http://d/x' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    const result = await fetchCerraMonthlyHistory(COORD_EU, {
      cdsApiKey: 'k',
      startYear: 2020,
      endYear: 2020,
    });
    expect(result.ok).toBe(true);
  });

  it('returns Configuration error when API key missing', async () => {
    const result = await fetchCerraMonthlyHistory(COORD_EU);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.Configuration);
  });

  it('reads CDS_API_KEY from environment', async () => {
    process.env.CDS_API_KEY = 'env-key';
    setMockNetCdf([{ year: 2020, month: 1, speed: 6.5 }]);
    const fetchMock = mockFetchSequence([
      { status: 200, body: { state: 'completed', request_id: 'r', location: 'http://d/x' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    const result = await fetchCerraMonthlyHistory(COORD_EU, { startYear: 2020, endYear: 2020 });
    expect(result.ok).toBe(true);
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit)?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer env-key');
  });

  it('returns OutOfRange when startYear > endYear', async () => {
    const result = await fetchCerraMonthlyHistory(COORD_EU, {
      cdsApiKey: 'k',
      startYear: 2020,
      endYear: 2010,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.OutOfRange);
  });

  it('produces a ReanalysisSource with 10m reference height', async () => {
    setMockNetCdf([
      { year: 2019, month: 12, speed: 8.0 },
      { year: 2020, month: 1, speed: 9.0 },
      { year: 2020, month: 2, speed: 7.5 },
    ]);
    mockFetchSequence([
      { status: 200, body: { state: 'completed', request_id: 'r', location: 'http://d/x' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    const result = await fetchCerraMonthlyHistory(COORD_EU, {
      cdsApiKey: 'k',
      startYear: 2019,
      endYear: 2020,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary.referenceHeightM).toBe(10);
      expect(result.value.history.records).toHaveLength(3);
      expect(result.value.summary.annualAverageSpeedMs).toBeGreaterThan(7);
    }
  });

  it('caches results across calls', async () => {
    setMockNetCdf([{ year: 2020, month: 1, speed: 6.5 }]);
    const fetchMock = mockFetchSequence([
      { status: 200, body: { state: 'completed', request_id: 'r', location: 'http://d/x' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    await fetchCerraMonthlyHistory(COORD_EU, { cdsApiKey: 'k', startYear: 2020, endYear: 2020 });
    const callsAfterFirst = fetchMock.mock.calls.length;
    await fetchCerraMonthlyHistory(COORD_EU, { cdsApiKey: 'k', startYear: 2020, endYear: 2020 });
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('returns DataFetchFailed on submission HTTP error', async () => {
    mockFetchSequence([{ status: 500, body: { error: 'boom' } }]);
    const result = await fetchCerraMonthlyHistory(COORD_EU, {
      cdsApiKey: 'k',
      startYear: 2020,
      endYear: 2020,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.DataFetchFailed);
  });

  it('returns DataFetchFailed when CDS reports failed task on submission', async () => {
    mockFetchSequence([
      { status: 200, body: { state: 'failed', error: { reason: 'unsupported area' } } },
    ]);
    const result = await fetchCerraMonthlyHistory(COORD_EU, {
      cdsApiKey: 'k',
      startYear: 2020,
      endYear: 2020,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.DataFetchFailed);
      expect(result.error.message).toContain('unsupported');
    }
  });

  it('polls until completion', async () => {
    setMockNetCdf([{ year: 2020, month: 1, speed: 6.5 }]);
    mockFetchSequence([
      { status: 200, body: { state: 'queued', request_id: 'r' } },
      { status: 200, body: { state: 'running', request_id: 'r' } },
      { status: 200, body: { state: 'completed', location: 'http://d/x' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    const result = await fetchCerraMonthlyHistory(COORD_EU, {
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
      { status: 200, body: { state: 'queued', request_id: 'r' } },
      { status: 200, body: { state: 'running', request_id: 'r' } },
    ]);
    const result = await fetchCerraMonthlyHistory(COORD_EU, {
      cdsApiKey: 'k',
      startYear: 2020,
      endYear: 2020,
      pollIntervalSeconds: 0,
      maxPollSeconds: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.Timeout);
  });

  it('returns InsufficientData when NetCDF yields zero records', async () => {
    mockNetCdfData = {
      variables: [
        { name: 'time' },
        { name: 'latitude' },
        { name: 'longitude' },
        { name: 'si10' },
      ],
      data: { time: [], latitude: [], longitude: [], si10: [] },
    };
    mockFetchSequence([
      { status: 200, body: { state: 'completed', request_id: 'r', location: 'http://d/x' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    const result = await fetchCerraMonthlyHistory(COORD_EU, {
      cdsApiKey: 'k',
      startYear: 2020,
      endYear: 2020,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.InsufficientData);
  });

  it('uses the CERRA single-levels dataset URL', async () => {
    setMockNetCdf([{ year: 2020, month: 1, speed: 6.5 }]);
    const fetchMock = mockFetchSequence([
      { status: 200, body: { state: 'completed', request_id: 'r', location: 'http://d/x' } },
      { status: 200, bodyBuffer: new ArrayBuffer(8) },
    ]);
    await fetchCerraMonthlyHistory(COORD_EU, { cdsApiKey: 'k', startYear: 2020, endYear: 2020 });
    const submitUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(submitUrl).toContain('reanalysis-cerra-single-levels');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.variable).toBe('10m_wind_speed');
  });
});

describe('parseCerraNetCdf', () => {
  it('parses 10m wind speed records sorted by date', () => {
    setMockNetCdf([
      { year: 2020, month: 3, speed: 7.0 },
      { year: 2020, month: 1, speed: 9.0 },
    ]);
    const result = parseCerraNetCdf(new ArrayBuffer(8), COORD_EU);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((r) => r.month)).toEqual([1, 3]);
      expect(result.value[0]?.ws10m).toBeCloseTo(9.0, 5);
    }
  });

  it('returns ParseError when speed variable missing', () => {
    mockNetCdfData = {
      variables: [{ name: 'time' }, { name: 'latitude' }, { name: 'longitude' }],
      data: { time: [0], latitude: [55], longitude: [-4] },
    };
    const result = parseCerraNetCdf(new ArrayBuffer(8), COORD_EU);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.ParseError);
  });

  it('returns InsufficientData when axes empty', () => {
    mockNetCdfData = {
      variables: [
        { name: 'time' },
        { name: 'latitude' },
        { name: 'longitude' },
        { name: 'si10' },
      ],
      data: { time: [], latitude: [], longitude: [], si10: [] },
    };
    const result = parseCerraNetCdf(new ArrayBuffer(8), COORD_EU);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.InsufficientData);
  });
});
