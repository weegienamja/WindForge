import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCerraMonthlyHistory, parseCerraNetCdf } from '../src/datasources/cerra.js';
import { ScoringErrorCode } from '../src/types/errors.js';

let mockNetCdfData: { variables: Array<{ name: string }>; data: Record<string, number[]> } = {
  variables: [],
  data: {},
};

vi.mock('netcdfjs', () => ({
  NetCDFReader: class {
    variables = mockNetCdfData.variables;
    getDataVariable(name: string): number[] {
      const value = mockNetCdfData.data[name];
      if (!value) throw new Error(`unknown var ${name}`);
      return value;
    }
  },
}));

const COORD_EU = { lat: 55.7644, lng: -4.177 };
const COORD_AU = { lat: -33.86, lng: 151.21 };

function hoursSince1900(year: number, month: number): number {
  return (Date.UTC(year, month - 1, 1) - Date.UTC(1900, 0, 1)) / 3_600_000;
}

function setMockNetCdf(records: Array<{ year: number; month: number; speed: number }>): void {
  mockNetCdfData = {
    variables: [{ name: 'time' }, { name: 'latitude' }, { name: 'longitude' }, { name: 'si10' }],
    data: {
      time: records.map((r) => hoursSince1900(r.year, r.month)),
      latitude: [COORD_EU.lat],
      longitude: [COORD_EU.lng],
      si10: records.map((r) => r.speed),
    },
  };
}

describe('fetchCerraMonthlyHistory', () => {
  beforeEach(() => delete process.env.CDS_API_KEY);

  it('rejects out-of-domain coordinates before configuration checks', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchCerraMonthlyHistory(COORD_AU, { cdsApiKey: 'key' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.OutOfRange);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a credential for an in-domain request', async () => {
    const result = await fetchCerraMonthlyHistory(COORD_EU);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.Configuration);
  });

  it('stays explicitly disabled even with a credential and makes no HTTP call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchCerraMonthlyHistory(COORD_EU, { cdsApiKey: 'key' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.Configuration);
      expect(result.error.message).toContain('disabled');
      expect(result.error.message).toContain('monthly climatology');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('parseCerraNetCdf', () => {
  it('parses 10m wind speed records sorted by date', () => {
    setMockNetCdf([
      { year: 2020, month: 3, speed: 7 },
      { year: 2020, month: 1, speed: 9 },
    ]);
    const result = parseCerraNetCdf(new ArrayBuffer(8), COORD_EU);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((r) => r.month)).toEqual([1, 3]);
      expect(result.value[0]?.ws10m).toBeCloseTo(9, 5);
    }
  });

  it('returns ParseError when the speed variable is missing', () => {
    mockNetCdfData = {
      variables: [{ name: 'time' }, { name: 'latitude' }, { name: 'longitude' }],
      data: { time: [0], latitude: [55], longitude: [-4] },
    };
    const result = parseCerraNetCdf(new ArrayBuffer(8), COORD_EU);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.ParseError);
  });

  it('returns InsufficientData when axes are empty', () => {
    setMockNetCdf([]);
    const result = parseCerraNetCdf(new ArrayBuffer(8), COORD_EU);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ScoringErrorCode.InsufficientData);
  });
});
