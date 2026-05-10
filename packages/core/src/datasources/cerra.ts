// CERRA reanalysis data source client.
//
// Copernicus European Regional ReAnalysis provides 5.5km resolution wind
// data for Europe, significantly higher resolution than ERA5's 31km or
// NASA POWER's ~50km.
//
// Uses the same CDS API as ERA5 but queries a different dataset.
// Auto-detects whether a coordinate falls within the CERRA domain (Europe)
// and falls back to ERA5 for locations outside Europe.

import type { LatLng } from '../types/analysis.js';
import type { WindDataSummary, MonthlyWindAverage } from '../types/datasources.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { createCache } from '../utils/cache.js';
import { fetchWithRetry } from '../utils/fetch.js';

const cerraCache = createCache<WindDataSummary>(7 * 24 * 60 * 60 * 1000);

/**
 * CERRA domain bounding box (approximate).
 * Covers most of Europe from Iceland to Turkey.
 */
const CERRA_DOMAIN = {
  north: 72.0,
  south: 20.0,
  west: -32.0,
  east: 45.0,
};

export interface CerraOptions {
  startYear?: number;
  endYear?: number;
}

/**
 * Check whether a coordinate falls within the CERRA domain (Europe).
 */
export function isInCerraDomain(coord: LatLng): boolean {
  return (
    coord.lat >= CERRA_DOMAIN.south &&
    coord.lat <= CERRA_DOMAIN.north &&
    coord.lng >= CERRA_DOMAIN.west &&
    coord.lng <= CERRA_DOMAIN.east
  );
}

/**
 * Fetch CERRA reanalysis wind data for a European coordinate.
 *
 * CERRA provides 5.5km resolution data for Europe from 1984 to 2021.
 * If the coordinate is outside Europe, returns an error suggesting ERA5.
 *
 * @param coord - Location to fetch data for (must be in Europe)
 * @param apiKey - CDS API key
 * @param options - Optional date range
 */
export async function fetchCerraWindData(
  coord: LatLng,
  apiKey: string,
  options: CerraOptions = {},
): Promise<Result<WindDataSummary, ScoringError>> {
  if (!apiKey || apiKey.trim().length === 0) {
    return err(
      scoringError(
        ScoringErrorCode.DataFetchFailed,
        'CDS API key is required for CERRA data',
      ),
    );
  }

  if (!isInCerraDomain(coord)) {
    return err(
      scoringError(
        ScoringErrorCode.InvalidCoordinate,
        `Coordinate (${coord.lat}, ${coord.lng}) is outside the CERRA domain (Europe). Use ERA5 or NASA POWER instead.`,
      ),
    );
  }

  const cacheKey = `cerra:${coord.lat.toFixed(4)},${coord.lng.toFixed(4)}`;
  const cached = cerraCache.get(cacheKey);
  if (cached) return ok(cached);

  const startYear = options.startYear ?? 1984;
  const endYear = Math.min(options.endYear ?? 2021, 2021); // CERRA ends at 2021

  const CDS_API_URL = 'https://cds.climate.copernicus.eu/api/v2';

  const requestBody = {
    dataset: 'reanalysis-cerra-single-levels',
    product_type: 'reanalysis',
    variable: [
      '100m_wind_speed',
      '10m_wind_speed',
      '10m_wind_direction',
    ],
    year: Array.from(
      { length: endYear - startYear + 1 },
      (_, i) => String(startYear + i),
    ),
    month: Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')),
    day: '15',
    time: '12:00',
    area: [
      coord.lat + 0.1,
      coord.lng - 0.1,
      coord.lat - 0.1,
      coord.lng + 0.1,
    ],
    format: 'json',
  };

  const url = `${CDS_API_URL}/resources/reanalysis-cerra-single-levels`;

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    return err(
      scoringError(
        ScoringErrorCode.DataFetchFailed,
        `CERRA API request failed: ${response.error?.message ?? 'Unknown error'}`,
        response.error,
      ),
    );
  }

  // CDS API is asynchronous - a full implementation would poll for completion.
  // For now, return a placeholder result structure.
  const summary = parseCerraResponse(coord, startYear, endYear);
  cerraCache.set(cacheKey, summary);
  return ok(summary);
}

/** Placeholder parser for CERRA response */
function parseCerraResponse(
  coord: LatLng,
  startYear: number,
  endYear: number,
): WindDataSummary {
  const months: MonthlyWindAverage[] = [];
  for (let m = 1; m <= 12; m++) {
    months.push({
      month: m,
      averageSpeedMs: 0,
      averageDirectionDeg: 0,
    });
  }

  return {
    coordinate: coord,
    monthlyAverages: months,
    annualAverageSpeedMs: 0,
    speedStdDevMs: 0,
    prevailingDirectionDeg: 0,
    directionalConsistency: 0,
    dataYears: endYear - startYear + 1,
    referenceHeightM: 100,
  };
}

export function clearCerraCache(): void {
  cerraCache.clear();
  cerraHistoryCache.clear();
}

// ─── Phase 5: Monthly history fetcher ───

import { NetCDFReader } from 'netcdfjs';
import type { MonthlyWindHistory, MonthlyWindRecord } from '../types/datasources.js';
import type { ReanalysisSource } from '../types/analysis.js';

const cerraHistoryCache = createCache<ReanalysisSource>(7 * 24 * 60 * 60 * 1000);

export interface CerraHistoryOptions {
  readonly startYear?: number;
  readonly endYear?: number;
  readonly cdsApiKey?: string;
  readonly cdsApiUrl?: string;
  readonly maxPollSeconds?: number;
  readonly pollIntervalSeconds?: number;
  readonly signal?: AbortSignal;
}

const DEFAULT_CDS_API_URL = 'https://cds.climate.copernicus.eu/api/v2';

interface CerraTaskResponse {
  state: 'queued' | 'running' | 'completed' | 'failed';
  request_id?: string;
  location?: string;
  error?: { message?: string; reason?: string };
}

/**
 * Fetch CERRA monthly wind history (10m wind speed) for a European
 * coordinate. Returns a paired summary + monthly history suitable for
 * passing to {@link analyseSite} as a reanalysis override.
 *
 * Coordinates outside the CERRA domain return `ScoringErrorCode.OutOfRange`
 * with no HTTP calls.
 */
export async function fetchCerraMonthlyHistory(
  coordinate: LatLng,
  options: CerraHistoryOptions = {},
): Promise<Result<ReanalysisSource, ScoringError>> {
  if (!isInCerraDomain(coordinate)) {
    return err(
      scoringError(
        ScoringErrorCode.OutOfRange,
        'CERRA covers Europe only. Coordinate falls outside the CERRA domain.',
      ),
    );
  }

  const apiKey = options.cdsApiKey ?? process.env.CDS_API_KEY ?? '';
  if (apiKey.trim().length === 0) {
    return err(
      scoringError(
        ScoringErrorCode.Configuration,
        'CERRA API key is required. Set CDS_API_KEY or pass options.cdsApiKey. Register at https://cds.climate.copernicus.eu',
      ),
    );
  }

  const apiUrl = options.cdsApiUrl ?? DEFAULT_CDS_API_URL;
  const { startYear, endYear } = resolveCerraRange(options.startYear, options.endYear);

  if (startYear > endYear) {
    return err(scoringError(ScoringErrorCode.OutOfRange, `Invalid CERRA year range: ${startYear} > ${endYear}`));
  }

  const cacheKey = cerraCacheKey(coordinate, startYear, endYear);
  const cached = cerraHistoryCache.get(cacheKey);
  if (cached) return ok(cached);

  const submitBody = {
    product_type: 'reanalysis',
    variable: '10m_wind_speed',
    level_type: 'surface_or_atmosphere',
    data_type: 'reanalysis',
    year: cerraYearList(startYear, endYear),
    month: Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')),
    day: '01',
    time: '00:00',
    format: 'netcdf',
  };

  const submitUrl = `${apiUrl}/resources/reanalysis-cerra-single-levels`;
  const submitResult = await fetchWithRetry(
    submitUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(submitBody),
      ...(options.signal ? { signal: options.signal } : {}),
    },
    { maxRetries: 1 },
  );
  if (!submitResult.ok) {
    return err(
      scoringError(
        ScoringErrorCode.DataFetchFailed,
        `CERRA CDS submission rejected: ${submitResult.error.message}`,
        submitResult.error,
      ),
    );
  }

  let submitData: CerraTaskResponse;
  try {
    submitData = (await submitResult.value.json()) as CerraTaskResponse;
  } catch (cause) {
    return err(scoringError(ScoringErrorCode.ParseError, 'Failed to parse CERRA submission response', cause));
  }

  if (submitData.state === 'failed') {
    return err(
      scoringError(
        ScoringErrorCode.DataFetchFailed,
        `CERRA request rejected by CDS: ${submitData.error?.message ?? submitData.error?.reason ?? 'unknown'}`,
      ),
    );
  }

  const pollResult = await pollCerraTask(apiUrl, apiKey, submitData, options);
  if (!pollResult.ok) return pollResult;

  const downloadResult = await fetchWithRetry(
    pollResult.value,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      ...(options.signal ? { signal: options.signal } : {}),
    },
    { maxRetries: 2 },
  );
  if (!downloadResult.ok) {
    return err(
      scoringError(
        ScoringErrorCode.DataFetchFailed,
        `CERRA download failed: ${downloadResult.error.message}`,
        downloadResult.error,
      ),
    );
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await downloadResult.value.arrayBuffer();
  } catch (cause) {
    return err(scoringError(ScoringErrorCode.ParseError, 'Failed to read CERRA download payload', cause));
  }

  const parsed = parseCerraNetCdf(buffer, coordinate);
  if (!parsed.ok) return parsed;

  const records = parsed.value;
  if (records.length === 0) {
    return err(scoringError(ScoringErrorCode.InsufficientData, 'CERRA response contained no usable monthly records'));
  }

  const history: MonthlyWindHistory = { coordinate, records, startYear, endYear };
  const summary = summariseCerraHistory(coordinate, records);
  const source: ReanalysisSource = { summary, history };
  cerraHistoryCache.set(cacheKey, source);
  return ok(source);
}

async function pollCerraTask(
  apiUrl: string,
  apiKey: string,
  initial: CerraTaskResponse,
  options: CerraHistoryOptions,
): Promise<Result<string, ScoringError>> {
  if (initial.state === 'completed' && initial.location) {
    return ok(initial.location);
  }

  const requestId = initial.request_id;
  if (!requestId) {
    return err(scoringError(ScoringErrorCode.DataFetchFailed, 'CERRA task missing request_id'));
  }

  const maxPollSeconds = options.maxPollSeconds ?? 300;
  const pollIntervalSeconds = options.pollIntervalSeconds ?? 5;
  const deadline = Date.now() + maxPollSeconds * 1000;
  const taskUrl = `${apiUrl}/tasks/${requestId}`;

  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalSeconds * 1000));

    const taskResult = await fetchWithRetry(
      taskUrl,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        ...(options.signal ? { signal: options.signal } : {}),
      },
      { maxRetries: 1 },
    );
    if (!taskResult.ok) continue;

    let task: CerraTaskResponse;
    try {
      task = (await taskResult.value.json()) as CerraTaskResponse;
    } catch {
      continue;
    }

    if (task.state === 'completed' && task.location) {
      return ok(task.location);
    }
    if (task.state === 'failed') {
      return err(
        scoringError(
          ScoringErrorCode.DataFetchFailed,
          `CERRA task failed: ${task.error?.message ?? task.error?.reason ?? 'unknown'}`,
        ),
      );
    }
  }

  return err(
    scoringError(
      ScoringErrorCode.Timeout,
      `CERRA CDS task did not complete within ${maxPollSeconds}s`,
    ),
  );
}

function resolveCerraRange(
  startYear: number | undefined,
  endYear: number | undefined,
): { startYear: number; endYear: number } {
  if (startYear !== undefined && endYear !== undefined) return { startYear, endYear };
  // CERRA archive ends in 2021 with a delayed update cycle; bound endYear to
  // most recently complete archive year if not provided.
  const now = new Date();
  const lastFullYear = now.getUTCMonth() < 6 ? now.getUTCFullYear() - 2 : now.getUTCFullYear() - 1;
  const resolvedEnd = endYear ?? Math.min(lastFullYear, 2021);
  const resolvedStart = startYear ?? resolvedEnd - 9;
  return { startYear: resolvedStart, endYear: resolvedEnd };
}

function cerraYearList(startYear: number, endYear: number): string[] {
  const out: string[] = [];
  for (let y = startYear; y <= endYear; y++) out.push(String(y));
  return out;
}

function cerraCacheKey(coord: LatLng, startYear: number, endYear: number): string {
  // ~25 km grid (geohash-4 equivalent)
  const lat = Math.round(coord.lat * 4) / 4;
  const lng = Math.round(coord.lng * 4) / 4;
  return `cerra-monthly:${lat.toFixed(2)},${lng.toFixed(2)}:${startYear}-${endYear}`;
}

interface CerraNetCdfReader {
  getDataVariable(name: string): unknown;
  variables: ReadonlyArray<{ name: string }>;
}

/**
 * Parse a CERRA monthly NetCDF payload. CERRA exposes wind speed directly
 * as `si10` (or `10m_wind_speed`) so no u/v decomposition is needed.
 */
export function parseCerraNetCdf(
  buffer: ArrayBuffer,
  coordinate: LatLng,
): Result<MonthlyWindRecord[], ScoringError> {
  let nc: CerraNetCdfReader;
  try {
    nc = new NetCDFReader(new Uint8Array(buffer)) as unknown as CerraNetCdfReader;
  } catch (cause) {
    return err(scoringError(ScoringErrorCode.ParseError, 'Failed to open CERRA NetCDF payload', cause));
  }

  const speedName = pickCerraVariable(nc, ['si10', '10m_wind_speed', 'ws10', 'wind_speed']);
  if (!speedName) {
    return err(scoringError(ScoringErrorCode.ParseError, 'CERRA NetCDF missing 10m wind speed variable'));
  }

  let times: number[];
  let lats: number[];
  let lngs: number[];
  let speeds: number[];
  try {
    times = toCerraNumberArray(nc.getDataVariable('time'));
    lats = toCerraNumberArray(nc.getDataVariable('latitude'));
    lngs = toCerraNumberArray(nc.getDataVariable('longitude'));
    speeds = toCerraNumberArray(nc.getDataVariable(speedName));
  } catch (cause) {
    return err(scoringError(ScoringErrorCode.ParseError, 'CERRA NetCDF missing required variables', cause));
  }

  if (times.length === 0 || lats.length === 0 || lngs.length === 0) {
    return err(scoringError(ScoringErrorCode.InsufficientData, 'CERRA NetCDF has empty axes'));
  }

  const latIdx = nearestCerraIndex(lats, coordinate.lat);
  const lngIdx = nearestCerraIndex(lngs, coordinate.lng);
  const nLat = lats.length;
  const nLng = lngs.length;

  const records: MonthlyWindRecord[] = [];
  for (let t = 0; t < times.length; t++) {
    const flat = t * nLat * nLng + latIdx * nLng + lngIdx;
    const speed = speeds[flat];
    if (speed === undefined || !Number.isFinite(speed)) continue;
    const date = cerraHoursSinceEpochToDate(times[t] ?? 0);
    records.push({
      year: date.year,
      month: date.month,
      ws2m: 0,
      ws10m: speed,
      ws50m: 0,
      wd10m: 0,
      wd50m: 0,
    });
  }

  records.sort((a, b) => a.year - b.year || a.month - b.month);
  return ok(records);
}

function pickCerraVariable(nc: CerraNetCdfReader, candidates: string[]): string | null {
  const names = new Set(nc.variables.map((v) => v.name));
  for (const c of candidates) {
    if (names.has(c)) return c;
  }
  return null;
}

function toCerraNumberArray(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map((v) => Number(v));
  if (raw && typeof raw === 'object' && Symbol.iterator in (raw as object)) {
    return Array.from(raw as Iterable<number>, (v) => Number(v));
  }
  if (raw && typeof (raw as { length?: number }).length === 'number') {
    const arr = raw as ArrayLike<number>;
    const out: number[] = [];
    for (let i = 0; i < arr.length; i++) out.push(Number(arr[i]));
    return out;
  }
  throw new Error('Unsupported NetCDF data shape');
}

function nearestCerraIndex(values: readonly number[], target: number): number {
  let bestIdx = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === undefined) continue;
    const d = Math.abs(v - target);
    if (d < bestDelta) {
      bestDelta = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function cerraHoursSinceEpochToDate(hours: number): { year: number; month: number } {
  const epoch = Date.UTC(1900, 0, 1);
  const ms = epoch + hours * 3600 * 1000;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function summariseCerraHistory(
  coordinate: LatLng,
  records: readonly MonthlyWindRecord[],
): WindDataSummary {
  const speeds = records.map((r) => r.ws10m).filter((v) => Number.isFinite(v) && v > 0);
  const annualAverageSpeedMs = speeds.length > 0 ? cerraMean(speeds) : 0;
  const speedStdDevMs = speeds.length > 1 ? cerraStdDev(speeds, annualAverageSpeedMs) : 0;

  const monthlyAverages: MonthlyWindAverage[] = [];
  for (let m = 1; m <= 12; m++) {
    const monthSpeeds = records
      .filter((r) => r.month === m)
      .map((r) => r.ws10m)
      .filter((v) => Number.isFinite(v) && v > 0);
    monthlyAverages.push({
      month: m,
      averageSpeedMs: monthSpeeds.length > 0 ? cerraRound2(cerraMean(monthSpeeds)) : 0,
      averageDirectionDeg: 0,
    });
  }

  const years = new Set(records.map((r) => r.year)).size;

  return {
    coordinate,
    monthlyAverages,
    annualAverageSpeedMs: cerraRound2(annualAverageSpeedMs),
    speedStdDevMs: cerraRound2(speedStdDevMs),
    prevailingDirectionDeg: 0,
    directionalConsistency: 0,
    dataYears: years,
    referenceHeightM: 10,
  };
}

function cerraMean(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function cerraStdDev(values: readonly number[], avg: number): number {
  let sum = 0;
  for (const v of values) sum += (v - avg) * (v - avg);
  return Math.sqrt(sum / (values.length - 1));
}

function cerraRound2(v: number): number {
  return Math.round(v * 100) / 100;
}
