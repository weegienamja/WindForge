// ERA5 reanalysis data source client.
//
// Fetches wind speed and direction data from the Copernicus Climate Data
// Store (CDS) API. ERA5 provides 31km resolution global coverage with
// sub-daily (hourly) temporal resolution at 100m and 10m heights.
//
// Requires a free API key from https://cds.climate.copernicus.eu
// If no key is provided, callers should fall back to NASA POWER.

import type { LatLng } from '../types/analysis.js';
import type { WindDataSummary, MonthlyWindAverage } from '../types/datasources.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { createCache } from '../utils/cache.js';
import { fetchWithRetry } from '../utils/fetch.js';

const era5Cache = createCache<WindDataSummary>(7 * 24 * 60 * 60 * 1000); // 7 days

export interface Era5Options {
  /** Start year (default: 2000) */
  startYear?: number;
  /** End year (default: current year - 1) */
  endYear?: number;
  /** Pressure levels or single levels. Default: 'single'. */
  levelType?: 'single' | 'pressure';
}

/**
 * Fetch ERA5 wind data for a coordinate.
 *
 * This calls the Copernicus CDS API to retrieve monthly-averaged ERA5
 * reanalysis wind data at 100m and 10m heights. Requires a valid API key.
 *
 * @param coord - Location to fetch data for
 * @param apiKey - CDS API key (from user registration)
 * @param options - Optional date range and level configuration
 */
export async function fetchEra5WindData(
  coord: LatLng,
  apiKey: string,
  options: Era5Options = {},
): Promise<Result<WindDataSummary, ScoringError>> {
  if (!apiKey || apiKey.trim().length === 0) {
    return err(
      scoringError(
        ScoringErrorCode.DataFetchFailed,
        'ERA5 API key is required. Register at https://cds.climate.copernicus.eu',
      ),
    );
  }

  const cacheKey = `era5:${coord.lat.toFixed(4)},${coord.lng.toFixed(4)}:${options.startYear ?? 2000}-${options.endYear ?? 'latest'}`;
  const cached = era5Cache.get(cacheKey);
  if (cached) return ok(cached);

  const history = await fetchEra5MonthlyHistory(coord, {
    cdsApiKey: apiKey,
    startYear: options.startYear,
    endYear: options.endYear,
    heightM: 100,
  });
  if (!history.ok) return history;
  era5Cache.set(cacheKey, history.value.summary);
  return ok(history.value.summary);
}

/**
 * Parse ERA5 u/v wind components into speed and direction.
 *
 * ERA5 provides wind as u (eastward) and v (northward) components.
 * Speed = sqrt(u^2 + v^2)
 * Direction = atan2(-u, -v) converted to meteorological convention (0=N, clockwise)
 */
export function uvToSpeedDirection(
  u: number,
  v: number,
): { speedMs: number; directionDeg: number } {
  const speedMs = Math.sqrt(u * u + v * v);
  if (speedMs < 0.001) return { speedMs: 0, directionDeg: 0 };

  // Meteorological direction: where wind comes FROM
  let directionDeg = (Math.atan2(-u, -v) * 180) / Math.PI;
  if (directionDeg < 0) directionDeg += 360;

  return {
    speedMs: Math.round(speedMs * 100) / 100,
    directionDeg: Math.round(directionDeg * 10) / 10,
  };
}

/**
 * Check whether the CDS API is reachable and the key is valid.
 */
export async function validateEra5ApiKey(apiKey: string): Promise<Result<boolean, ScoringError>> {
  if (!apiKey || apiKey.trim().length === 0) {
    return ok(false);
  }

  const url =
    'https://cds.climate.copernicus.eu/api/retrieve/v1/processes/reanalysis-era5-single-levels-monthly-means';
  const response = await fetchWithRetry(url, {
    headers: { 'PRIVATE-TOKEN': apiKey },
  });

  if (!response.ok) {
    return ok(false);
  }

  return ok(true);
}

export function clearEra5Cache(): void {
  era5Cache.clear();
  era5HistoryCache.clear();
}

// ─── Phase 5: Monthly history fetcher ───

import { NetCDFReader } from 'netcdfjs';
import type { MonthlyWindHistory, MonthlyWindRecord } from '../types/datasources.js';
import type { ReanalysisSource } from '../types/analysis.js';

const era5HistoryCache = createCache<ReanalysisSource>(7 * 24 * 60 * 60 * 1000);

export interface Era5HistoryOptions {
  readonly startYear?: number;
  readonly endYear?: number;
  readonly heightM?: 10 | 100;
  readonly cdsApiKey?: string;
  readonly cdsApiUrl?: string;
  readonly maxPollSeconds?: number;
  readonly pollIntervalSeconds?: number;
  readonly signal?: AbortSignal;
}

const DEFAULT_CDS_API_URL = 'https://cds.climate.copernicus.eu/api/retrieve/v1';

interface CdsTaskResponse {
  status?: 'accepted' | 'running' | 'successful' | 'failed' | 'rejected' | 'dismissed';
  jobID?: string;
  /** Legacy aliases accepted for test fixtures and self-hosted mirrors. */
  state?: 'queued' | 'running' | 'completed' | 'failed';
  request_id?: string;
  location?: string;
  error?: { message?: string; reason?: string };
}

/**
 * Fetch ERA5 monthly wind history at the configured height from the
 * Copernicus CDS API. Returns a paired summary + monthly history suitable
 * for passing to {@link analyseSite} as a reanalysis override.
 */
export async function fetchEra5MonthlyHistory(
  coordinate: LatLng,
  options: Era5HistoryOptions = {},
): Promise<Result<ReanalysisSource, ScoringError>> {
  const apiKey = options.cdsApiKey ?? process.env.CDS_API_KEY ?? '';
  if (apiKey.trim().length === 0) {
    return err(
      scoringError(
        ScoringErrorCode.Configuration,
        'ERA5 API key is required. Set CDS_API_KEY or pass options.cdsApiKey. Register at https://cds.climate.copernicus.eu',
      ),
    );
  }

  const apiUrl = options.cdsApiUrl ?? DEFAULT_CDS_API_URL;
  const heightM = options.heightM ?? 100;
  const { startYear, endYear } = resolveHistoryRange(options.startYear, options.endYear);

  if (startYear > endYear) {
    return err(
      scoringError(
        ScoringErrorCode.OutOfRange,
        `Invalid ERA5 year range: ${startYear} > ${endYear}`,
      ),
    );
  }

  const cacheKey = era5HistoryCacheKey(coordinate, startYear, endYear, heightM);
  const cached = era5HistoryCache.get(cacheKey);
  if (cached) return ok(cached);

  const variables = [`${heightM}m_u_component_of_wind`, `${heightM}m_v_component_of_wind`];

  const submitBody = {
    product_type: 'monthly_averaged_reanalysis',
    variable: variables,
    year: yearList(startYear, endYear),
    month: Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')),
    time: '00:00',
    area: [
      coordinate.lat + 0.05,
      coordinate.lng - 0.05,
      coordinate.lat - 0.05,
      coordinate.lng + 0.05,
    ],
    grid: [0.25, 0.25],
    format: 'netcdf',
  };

  const submitUrl = `${apiUrl}/processes/reanalysis-era5-single-levels-monthly-means/execution`;
  const submitResult = await fetchWithRetry(
    submitUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PRIVATE-TOKEN': apiKey,
        ...(options.signal ? {} : {}),
      },
      body: JSON.stringify({ inputs: submitBody }),
      ...(options.signal ? { signal: options.signal } : {}),
    },
    { maxRetries: 1 },
  );
  if (!submitResult.ok) {
    return err(
      scoringError(
        ScoringErrorCode.DataFetchFailed,
        `ERA5 CDS submission rejected: ${submitResult.error.message}`,
        submitResult.error,
      ),
    );
  }

  let submitData: CdsTaskResponse;
  try {
    submitData = (await submitResult.value.json()) as CdsTaskResponse;
  } catch (cause) {
    return err(
      scoringError(ScoringErrorCode.ParseError, 'Failed to parse ERA5 submission response', cause),
    );
  }

  if (isFailedTask(submitData)) {
    return err(
      scoringError(
        ScoringErrorCode.DataFetchFailed,
        `ERA5 request rejected by CDS: ${submitData.error?.message ?? submitData.error?.reason ?? 'unknown'}`,
      ),
    );
  }

  const requestId = submitData.jobID ?? submitData.request_id;
  if (!requestId && !isSuccessfulTask(submitData)) {
    return err(
      scoringError(ScoringErrorCode.DataFetchFailed, 'ERA5 submission did not return a jobID'),
    );
  }

  const pollResult = await pollCdsTask(apiUrl, apiKey, submitData, options);
  if (!pollResult.ok) return pollResult;

  const downloadUrl = pollResult.value;
  const downloadResult = await fetchWithRetry(
    downloadUrl,
    {
      headers: { 'PRIVATE-TOKEN': apiKey },
      ...(options.signal ? { signal: options.signal } : {}),
    },
    { maxRetries: 2 },
  );
  if (!downloadResult.ok) {
    return err(
      scoringError(
        ScoringErrorCode.DataFetchFailed,
        `ERA5 download failed: ${downloadResult.error.message}`,
        downloadResult.error,
      ),
    );
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await downloadResult.value.arrayBuffer();
  } catch (cause) {
    return err(
      scoringError(ScoringErrorCode.ParseError, 'Failed to read ERA5 download payload', cause),
    );
  }

  const parsed = parseEra5NetCdf(buffer, coordinate, heightM);
  if (!parsed.ok) return parsed;

  const records = parsed.value;
  if (records.length === 0) {
    return err(
      scoringError(
        ScoringErrorCode.InsufficientData,
        'ERA5 response contained no usable monthly records',
      ),
    );
  }

  const history: MonthlyWindHistory = {
    coordinate,
    records,
    startYear,
    endYear,
  };
  const summary = summariseEra5History(coordinate, records, heightM);
  if (
    summary.monthlyAverages.length !== 12 ||
    !Number.isFinite(summary.annualAverageSpeedMs) ||
    !Number.isFinite(summary.prevailingDirectionDeg)
  ) {
    return err(
      scoringError(
        ScoringErrorCode.InsufficientData,
        'ERA5 payload did not contain complete monthly speed and direction evidence',
      ),
    );
  }
  const source: ReanalysisSource = { summary, history };
  era5HistoryCache.set(cacheKey, source);
  return ok(source);
}

async function pollCdsTask(
  apiUrl: string,
  apiKey: string,
  initial: CdsTaskResponse,
  options: Era5HistoryOptions,
): Promise<Result<string, ScoringError>> {
  if (isSuccessfulTask(initial) && initial.location) {
    return ok(initial.location);
  }

  const requestId = initial.jobID ?? initial.request_id;
  if (!requestId) {
    return err(scoringError(ScoringErrorCode.DataFetchFailed, 'ERA5 task missing request_id'));
  }

  const maxPollSeconds = options.maxPollSeconds ?? 300;
  const pollIntervalSeconds = options.pollIntervalSeconds ?? 5;
  const deadline = Date.now() + maxPollSeconds * 1000;

  const taskUrl = `${apiUrl}/jobs/${requestId}`;

  while (Date.now() < deadline) {
    await sleep(pollIntervalSeconds * 1000);

    const taskResult = await fetchWithRetry(
      taskUrl,
      {
        headers: { 'PRIVATE-TOKEN': apiKey },
        ...(options.signal ? { signal: options.signal } : {}),
      },
      { maxRetries: 1 },
    );
    if (!taskResult.ok) continue;

    let task: CdsTaskResponse;
    try {
      task = (await taskResult.value.json()) as CdsTaskResponse;
    } catch {
      continue;
    }

    if (isSuccessfulTask(task)) {
      const resultsResult = await fetchWithRetry(
        `${apiUrl}/jobs/${requestId}/results`,
        {
          headers: { 'PRIVATE-TOKEN': apiKey },
          ...(options.signal ? { signal: options.signal } : {}),
        },
        { maxRetries: 1 },
      );
      if (!resultsResult.ok) {
        return err(
          scoringError(
            ScoringErrorCode.DataFetchFailed,
            `ERA5 result lookup failed: ${resultsResult.error.message}`,
          ),
        );
      }
      try {
        const results: unknown = await resultsResult.value.json();
        const href = findDownloadHref(results);
        if (href) return ok(href);
      } catch (cause) {
        return err(
          scoringError(ScoringErrorCode.ParseError, 'Failed to parse ERA5 results response', cause),
        );
      }
      return err(
        scoringError(
          ScoringErrorCode.DataFetchFailed,
          'ERA5 results did not contain a downloadable asset',
        ),
      );
    }
    if (isFailedTask(task)) {
      return err(
        scoringError(
          ScoringErrorCode.DataFetchFailed,
          `ERA5 task failed: ${task.error?.message ?? task.error?.reason ?? 'unknown'}`,
        ),
      );
    }
  }

  const elapsedSeconds = Math.round((Date.now() - (deadline - maxPollSeconds * 1000)) / 1000);
  return err(
    scoringError(
      ScoringErrorCode.Timeout,
      `ERA5 CDS task did not complete within ${maxPollSeconds}s (elapsed ${elapsedSeconds}s)`,
    ),
  );
}

function isSuccessfulTask(task: CdsTaskResponse): boolean {
  return task.status === 'successful' || task.state === 'completed';
}

function isFailedTask(task: CdsTaskResponse): boolean {
  return ['failed', 'rejected', 'dismissed'].includes(task.status ?? '') || task.state === 'failed';
}

function findDownloadHref(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  if ('href' in value && typeof (value as { href?: unknown }).href === 'string') {
    return (value as { href: string }).href;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = findDownloadHref(item);
        if (found) return found;
      }
    } else {
      const found = findDownloadHref(nested);
      if (found) return found;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveHistoryRange(
  startYear: number | undefined,
  endYear: number | undefined,
): { startYear: number; endYear: number } {
  if (startYear !== undefined && endYear !== undefined) {
    return { startYear, endYear };
  }
  const now = new Date();
  const isFirstHalfOfMonth = now.getUTCDate() < 15;
  const refMonth = isFirstHalfOfMonth ? now.getUTCMonth() - 1 : now.getUTCMonth();
  const refDate = new Date(Date.UTC(now.getUTCFullYear(), refMonth, 1));
  const resolvedEnd = endYear ?? refDate.getUTCFullYear();
  const resolvedStart = startYear ?? resolvedEnd - 9;
  return { startYear: resolvedStart, endYear: resolvedEnd };
}

function yearList(startYear: number, endYear: number): string[] {
  const out: string[] = [];
  for (let y = startYear; y <= endYear; y++) out.push(String(y));
  return out;
}

function era5HistoryCacheKey(
  coord: LatLng,
  startYear: number,
  endYear: number,
  heightM: number,
): string {
  // ~25 km grid (geohash-4 equivalent for caching)
  const lat = Math.round(coord.lat * 4) / 4;
  const lng = Math.round(coord.lng * 4) / 4;
  return `era5-monthly:${lat.toFixed(2)},${lng.toFixed(2)}:${startYear}-${endYear}:${heightM}m`;
}

/**
 * Parse an ERA5 monthly-means NetCDF payload at the requested height.
 *
 * Expected variables: `u{height}` and `v{height}` (or full names with
 * `_component_of_wind`). Time axis is hours since 1900-01-01.
 */
export function parseEra5NetCdf(
  buffer: ArrayBuffer,
  coordinate: LatLng,
  heightM: number,
): Result<MonthlyWindRecord[], ScoringError> {
  let nc: Era5NetCdfReader;
  try {
    nc = openNetCdf(buffer);
  } catch (cause) {
    return err(
      scoringError(ScoringErrorCode.ParseError, 'Failed to open ERA5 NetCDF payload', cause),
    );
  }

  const uName = pickVariableName(nc, [
    'u' + heightM,
    `${heightM}m_u_component_of_wind`,
    'u_component_of_wind',
  ]);
  const vName = pickVariableName(nc, [
    'v' + heightM,
    `${heightM}m_v_component_of_wind`,
    'v_component_of_wind',
  ]);
  if (!uName || !vName) {
    return err(
      scoringError(
        ScoringErrorCode.ParseError,
        `ERA5 NetCDF missing u/v variables for ${heightM}m`,
      ),
    );
  }

  let times: number[];
  let lats: number[];
  let lngs: number[];
  let uData: number[];
  let vData: number[];
  try {
    times = toNumberArray(nc.getDataVariable('time'));
    lats = toNumberArray(nc.getDataVariable('latitude'));
    lngs = toNumberArray(nc.getDataVariable('longitude'));
    uData = toNumberArray(nc.getDataVariable(uName));
    vData = toNumberArray(nc.getDataVariable(vName));
  } catch (cause) {
    return err(
      scoringError(ScoringErrorCode.ParseError, 'ERA5 NetCDF missing required variables', cause),
    );
  }

  if (times.length === 0 || lats.length === 0 || lngs.length === 0) {
    return err(scoringError(ScoringErrorCode.InsufficientData, 'ERA5 NetCDF has empty axes'));
  }

  const latIdx = nearestIndex(lats, coordinate.lat);
  const lngIdx = nearestIndex(lngs, coordinate.lng);
  const nLat = lats.length;
  const nLng = lngs.length;

  const records: MonthlyWindRecord[] = [];
  for (let t = 0; t < times.length; t++) {
    const flat = t * nLat * nLng + latIdx * nLng + lngIdx;
    const u = uData[flat];
    const v = vData[flat];
    if (u === undefined || v === undefined || !Number.isFinite(u) || !Number.isFinite(v)) continue;
    const { speedMs: speed, directionDeg } = uvToSpeedDirection(u, v);
    const date = hoursSinceEpochToDate(times[t] ?? 0);
    records.push({
      year: date.year,
      month: date.month,
      ws2m: null,
      ws10m: heightM === 10 ? speed : null,
      ws50m: null,
      wd10m: heightM === 10 ? directionDeg : null,
      wd50m: heightM === 100 ? directionDeg : null,
      // Note: for 100m we still populate ws50m as a proxy reference height
      // for downstream reconciliation (the reconciler uses average speed).
      ...(heightM === 100 ? { ws50m: speed } : {}),
    });
  }

  records.sort((a, b) => a.year - b.year || a.month - b.month);
  return ok(records);
}

interface Era5NetCdfReader {
  getDataVariable(name: string): unknown;
  variables: ReadonlyArray<{ name: string }>;
}

function openNetCdf(buffer: ArrayBuffer): Era5NetCdfReader {
  return new NetCDFReader(new Uint8Array(buffer)) as unknown as Era5NetCdfReader;
}

function pickVariableName(nc: Era5NetCdfReader, candidates: string[]): string | null {
  const names = new Set(nc.variables.map((v) => v.name));
  for (const c of candidates) {
    if (names.has(c)) return c;
  }
  return null;
}

function toNumberArray(raw: unknown): number[] {
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

function nearestIndex(values: readonly number[], target: number): number {
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

function hoursSinceEpochToDate(hours: number): { year: number; month: number } {
  // ERA5 time variable: hours since 1900-01-01 00:00:00.
  const epoch = Date.UTC(1900, 0, 1);
  const ms = epoch + hours * 3600 * 1000;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function summariseEra5History(
  coordinate: LatLng,
  records: readonly MonthlyWindRecord[],
  heightM: number,
): WindDataSummary {
  const speedField: keyof MonthlyWindRecord = heightM === 10 ? 'ws10m' : 'ws50m';
  const speeds = records
    .map((r) => r[speedField] as number)
    .filter((v) => Number.isFinite(v) && v > 0);

  const annualAverageSpeedMs = speeds.length > 0 ? mean(speeds) : Number.NaN;
  const speedStdDevMs = speeds.length > 1 ? stdDev(speeds, annualAverageSpeedMs) : 0;

  const monthlyAverages: MonthlyWindAverage[] = [];
  const directionField: keyof MonthlyWindRecord = heightM === 10 ? 'wd10m' : 'wd50m';
  for (let m = 1; m <= 12; m++) {
    const monthSpeeds = records
      .filter((r) => r.month === m)
      .map((r) => r[speedField] as number)
      .filter((v) => Number.isFinite(v) && v > 0);
    const monthDirections = records
      .filter((r) => r.month === m)
      .map((r) => r[directionField] as number | null)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    if (monthSpeeds.length === 0 || monthDirections.length === 0) continue;
    monthlyAverages.push({
      month: m,
      averageSpeedMs: round2(mean(monthSpeeds)),
      averageDirectionDeg: round2(meanAngle(monthDirections)),
    });
  }

  const years = new Set(records.map((r) => r.year)).size;
  const directions = records
    .map((r) => r[directionField] as number | null)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  return {
    coordinate,
    monthlyAverages,
    annualAverageSpeedMs: round2(annualAverageSpeedMs),
    speedStdDevMs: round2(speedStdDevMs),
    prevailingDirectionDeg: round2(meanAngle(directions)),
    directionalConsistency: round2(directionalConsistency(directions)),
    dataYears: years,
    referenceHeightM: heightM,
  };
}

function mean(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function stdDev(values: readonly number[], avg: number): number {
  let sum = 0;
  for (const v of values) sum += (v - avg) * (v - avg);
  return Math.sqrt(sum / (values.length - 1));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function meanAngle(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  let sin = 0;
  let cos = 0;
  for (const value of values) {
    const radians = (value * Math.PI) / 180;
    sin += Math.sin(radians);
    cos += Math.cos(radians);
  }
  const angle = (Math.atan2(sin, cos) * 180) / Math.PI;
  return angle < 0 ? angle + 360 : angle;
}

function directionalConsistency(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  let sin = 0;
  let cos = 0;
  for (const value of values) {
    const radians = (value * Math.PI) / 180;
    sin += Math.sin(radians);
    cos += Math.cos(radians);
  }
  return Math.sqrt(sin * sin + cos * cos) / values.length;
}
