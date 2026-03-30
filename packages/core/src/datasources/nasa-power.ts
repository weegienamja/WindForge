import type { LatLng } from '../types/analysis.js';
import type {
  WindDataSummary,
  MonthlyWindAverage,
  MonthlyWindRecord,
  MonthlyWindHistory,
  DailyWindRecord,
  DailyWindData,
  HourlyWindRecord,
  HourlyWindData,
} from '../types/datasources.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { createCache } from '../utils/cache.js';
import { fetchWithRetry } from '../utils/fetch.js';
import { mean, standardDeviation } from '../utils/geo.js';

// Separate caches with different TTLs
const windDataCache = createCache<WindDataSummary>(60 * 60 * 1000);
const monthlyHistoryCache = createCache<MonthlyWindHistory>(7 * 24 * 60 * 60 * 1000);
const dailyDataCache = createCache<DailyWindData>(24 * 60 * 60 * 1000);
const hourlyDataCache = createCache<HourlyWindData>(24 * 60 * 60 * 1000);

const MULTI_HEIGHT_PARAMS = 'WS2M,WS10M,WS50M,WD10M,WD50M';

interface NasaPowerResponse {
  properties: {
    parameter: Record<string, Record<string, number>>;
  };
}

function cacheKey(coord: LatLng, suffix = ''): string {
  return `${coord.lat.toFixed(4)},${coord.lng.toFixed(4)}${suffix}`;
}

// ─── Original summary fetch (backward-compatible) ───

export async function fetchWindData(
  coordinate: LatLng,
  signal?: AbortSignal,
): Promise<Result<WindDataSummary, ScoringError>> {
  const key = cacheKey(coordinate);
  const cached = windDataCache.get(key);
  if (cached) {
    return ok(cached);
  }

  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - 9;

  // Try multi-height params first, fall back to WS2M,WD2M
  const url =
    `https://power.larc.nasa.gov/api/temporal/monthly/point` +
    `?parameters=${MULTI_HEIGHT_PARAMS}` +
    `&community=RE` +
    `&longitude=${coordinate.lng}` +
    `&latitude=${coordinate.lat}` +
    `&start=${startYear}` +
    `&end=${endYear}` +
    `&format=JSON`;

  const result = await fetchWithRetry(url, signal ? { signal } : {});
  if (!result.ok) {
    return result;
  }

  let data: NasaPowerResponse;
  try {
    data = (await result.value.json()) as NasaPowerResponse;
  } catch (cause) {
    return err(
      scoringError(ScoringErrorCode.DataFetchFailed, 'Failed to parse NASA POWER response', cause),
    );
  }

  const params = data.properties.parameter;
  const hasWs50m = params.WS50M && Object.keys(params.WS50M).length > 0;

  // Use 50m data when available, otherwise fall back to 2m
  const windSpeeds = hasWs50m ? params.WS50M : (params.WS2M ?? {});
  const windDirections = hasWs50m ? (params.WD50M ?? {}) : (params.WD10M ?? params.WD2M ?? {});
  const referenceHeightM = hasWs50m ? 50 : 2;

  if (!windSpeeds || Object.keys(windSpeeds).length === 0) {
    return err(
      scoringError(ScoringErrorCode.DataFetchFailed, 'NASA POWER response missing wind parameters'),
    );
  }

  const summary = parseWindData(coordinate, windSpeeds, windDirections, referenceHeightM);
  windDataCache.set(key, summary);
  return ok(summary);
}

function parseWindData(
  coordinate: LatLng,
  speedsByYearMonth: Record<string, number>,
  directionsByYearMonth: Record<string, number>,
  referenceHeightM: number,
): WindDataSummary {
  const monthlyBuckets = new Map<number, { speeds: number[]; directions: number[] }>();

  for (const [yearMonth, speedMs] of Object.entries(speedsByYearMonth)) {
    if (yearMonth.length !== 6) continue;
    const month = Number.parseInt(yearMonth.slice(4), 10);
    const directionDeg = directionsByYearMonth[yearMonth];
    if (speedMs < 0 || directionDeg === undefined || directionDeg < 0) continue;

    if (!monthlyBuckets.has(month)) {
      monthlyBuckets.set(month, { speeds: [], directions: [] });
    }
    const bucket = monthlyBuckets.get(month)!;
    bucket.speeds.push(speedMs);
    bucket.directions.push(directionDeg);
  }

  const monthlyAverages: MonthlyWindAverage[] = [];
  const allSpeeds: number[] = [];

  for (let month = 1; month <= 12; month++) {
    const bucket = monthlyBuckets.get(month);
    if (!bucket || bucket.speeds.length === 0) {
      monthlyAverages.push({ month, averageSpeedMs: 0, averageDirectionDeg: 0 });
      continue;
    }
    const avgSpeed = mean(bucket.speeds);
    const avgDir = meanAngle(bucket.directions);
    monthlyAverages.push({ month, averageSpeedMs: avgSpeed, averageDirectionDeg: avgDir });
    allSpeeds.push(...bucket.speeds);
  }

  const annualAverageSpeedMs = mean(allSpeeds);
  const speedStdDevMs = standardDeviation(allSpeeds);

  const allDirections = [...monthlyBuckets.values()].flatMap((b) => b.directions);
  const prevailingDirectionDeg = meanAngle(allDirections);
  const directionalConsistency = computeDirectionalConsistency(allDirections);

  const years = new Set<number>();
  for (const ym of Object.keys(speedsByYearMonth)) {
    if (ym.length === 6) {
      years.add(Number.parseInt(ym.slice(0, 4), 10));
    }
  }

  return {
    coordinate,
    monthlyAverages,
    annualAverageSpeedMs,
    speedStdDevMs,
    prevailingDirectionDeg,
    directionalConsistency,
    dataYears: years.size,
    referenceHeightM,
  };
}

// ─── Monthly history (multi-height, year-by-year records) ───

export async function fetchMonthlyWindHistory(
  coordinate: LatLng,
  yearsBack = 10,
  signal?: AbortSignal,
): Promise<Result<MonthlyWindHistory, ScoringError>> {
  const key = cacheKey(coordinate, `:monthly:${yearsBack}`);
  const cached = monthlyHistoryCache.get(key);
  if (cached) return ok(cached);

  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - (yearsBack - 1);

  const url =
    `https://power.larc.nasa.gov/api/temporal/monthly/point` +
    `?parameters=${MULTI_HEIGHT_PARAMS}` +
    `&community=RE` +
    `&longitude=${coordinate.lng}` +
    `&latitude=${coordinate.lat}` +
    `&start=${startYear}` +
    `&end=${endYear}` +
    `&format=JSON`;

  const result = await fetchWithRetry(url, signal ? { signal } : {});
  if (!result.ok) return result;

  let data: NasaPowerResponse;
  try {
    data = (await result.value.json()) as NasaPowerResponse;
  } catch (cause) {
    return err(scoringError(ScoringErrorCode.DataFetchFailed, 'Failed to parse NASA POWER monthly response', cause));
  }

  const records = parseMonthlyRecords(data.properties.parameter);
  const history: MonthlyWindHistory = { coordinate, records, startYear, endYear };
  monthlyHistoryCache.set(key, history);
  return ok(history);
}

function parseMonthlyRecords(params: Record<string, Record<string, number>>): MonthlyWindRecord[] {
  const ws2m = params.WS2M ?? {};
  const ws10m = params.WS10M ?? {};
  const ws50m = params.WS50M ?? {};
  const wd10m = params.WD10M ?? {};
  const wd50m = params.WD50M ?? {};

  const records: MonthlyWindRecord[] = [];

  for (const yearMonth of Object.keys(ws2m)) {
    if (yearMonth.length !== 6) continue;
    const year = Number.parseInt(yearMonth.slice(0, 4), 10);
    const month = Number.parseInt(yearMonth.slice(4), 10);
    const v2 = ws2m[yearMonth] ?? -999;
    if (v2 < 0) continue;

    records.push({
      year,
      month,
      ws2m: v2,
      ws10m: ws10m[yearMonth] ?? -999,
      ws50m: ws50m[yearMonth] ?? -999,
      wd10m: wd10m[yearMonth] ?? -999,
      wd50m: wd50m[yearMonth] ?? -999,
    });
  }

  records.sort((a, b) => a.year - b.year || a.month - b.month);
  return records;
}

// ─── Daily data ───

export async function fetchDailyWindData(
  coordinate: LatLng,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<Result<DailyWindData, ScoringError>> {
  const key = cacheKey(coordinate, `:daily:${startDate}:${endDate}`);
  const cached = dailyDataCache.get(key);
  if (cached) return ok(cached);

  const start = startDate.replace(/-/g, '');
  const end = endDate.replace(/-/g, '');

  const url =
    `https://power.larc.nasa.gov/api/temporal/daily/point` +
    `?parameters=${MULTI_HEIGHT_PARAMS}` +
    `&community=RE` +
    `&longitude=${coordinate.lng}` +
    `&latitude=${coordinate.lat}` +
    `&start=${start}` +
    `&end=${end}` +
    `&format=JSON`;

  const result = await fetchWithRetry(url, signal ? { signal } : {});
  if (!result.ok) return result;

  let data: NasaPowerResponse;
  try {
    data = (await result.value.json()) as NasaPowerResponse;
  } catch (cause) {
    return err(scoringError(ScoringErrorCode.DataFetchFailed, 'Failed to parse NASA POWER daily response', cause));
  }

  const records = parseDailyRecords(data.properties.parameter);
  const daily: DailyWindData = { coordinate, records, startDate, endDate };
  dailyDataCache.set(key, daily);
  return ok(daily);
}

function parseDailyRecords(params: Record<string, Record<string, number>>): DailyWindRecord[] {
  const ws2m = params.WS2M ?? {};
  const ws10m = params.WS10M ?? {};
  const ws50m = params.WS50M ?? {};
  const wd10m = params.WD10M ?? {};
  const wd50m = params.WD50M ?? {};

  const records: DailyWindRecord[] = [];

  for (const dateKey of Object.keys(ws2m)) {
    if (dateKey.length !== 8) continue;
    const v2 = ws2m[dateKey] ?? -999;
    if (v2 < 0) continue;
    const date = `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;

    records.push({
      date,
      ws2m: v2,
      ws10m: ws10m[dateKey] ?? -999,
      ws50m: ws50m[dateKey] ?? -999,
      wd10m: wd10m[dateKey] ?? -999,
      wd50m: wd50m[dateKey] ?? -999,
    });
  }

  records.sort((a, b) => a.date.localeCompare(b.date));
  return records;
}

// ─── Hourly data ───

export async function fetchHourlyWindData(
  coordinate: LatLng,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<Result<HourlyWindData, ScoringError>> {
  const key = cacheKey(coordinate, `:hourly:${startDate}:${endDate}`);
  const cached = hourlyDataCache.get(key);
  if (cached) return ok(cached);

  const start = startDate.replace(/-/g, '');
  const end = endDate.replace(/-/g, '');

  const url =
    `https://power.larc.nasa.gov/api/temporal/hourly/point` +
    `?parameters=${MULTI_HEIGHT_PARAMS}` +
    `&community=RE` +
    `&longitude=${coordinate.lng}` +
    `&latitude=${coordinate.lat}` +
    `&start=${start}` +
    `&end=${end}` +
    `&format=JSON`;

  const result = await fetchWithRetry(url, signal ? { signal } : {});
  if (!result.ok) return result;

  let data: NasaPowerResponse;
  try {
    data = (await result.value.json()) as NasaPowerResponse;
  } catch (cause) {
    return err(scoringError(ScoringErrorCode.DataFetchFailed, 'Failed to parse NASA POWER hourly response', cause));
  }

  const records = parseHourlyRecords(data.properties.parameter);
  const hourly: HourlyWindData = { coordinate, records, startDate, endDate };
  hourlyDataCache.set(key, hourly);
  return ok(hourly);
}

function parseHourlyRecords(params: Record<string, Record<string, number>>): HourlyWindRecord[] {
  const ws2m = params.WS2M ?? {};
  const ws10m = params.WS10M ?? {};
  const ws50m = params.WS50M ?? {};
  const wd10m = params.WD10M ?? {};
  const wd50m = params.WD50M ?? {};

  const records: HourlyWindRecord[] = [];

  for (const dtKey of Object.keys(ws2m)) {
    if (dtKey.length !== 10) continue; // YYYYMMDDHH
    const v2 = ws2m[dtKey] ?? -999;
    if (v2 < 0) continue;
    const datetime = `${dtKey.slice(0, 4)}-${dtKey.slice(4, 6)}-${dtKey.slice(6, 8)}T${dtKey.slice(8, 10)}:00`;

    records.push({
      datetime,
      ws2m: v2,
      ws10m: ws10m[dtKey] ?? -999,
      ws50m: ws50m[dtKey] ?? -999,
      wd10m: wd10m[dtKey] ?? -999,
      wd50m: wd50m[dtKey] ?? -999,
    });
  }

  records.sort((a, b) => a.datetime.localeCompare(b.datetime));
  return records;
}

// ─── Helpers ───

function meanAngle(anglesDeg: number[]): number {
  if (anglesDeg.length === 0) return 0;
  let sinSum = 0;
  let cosSum = 0;
  for (const deg of anglesDeg) {
    const rad = (deg * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  let result = (Math.atan2(sinSum / anglesDeg.length, cosSum / anglesDeg.length) * 180) / Math.PI;
  if (result < 0) result += 360;
  return result;
}

function computeDirectionalConsistency(anglesDeg: number[]): number {
  if (anglesDeg.length === 0) return 0;
  let sinSum = 0;
  let cosSum = 0;
  for (const deg of anglesDeg) {
    const rad = (deg * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  const resultantLength = Math.sqrt(sinSum ** 2 + cosSum ** 2) / anglesDeg.length;
  return resultantLength;
}

export function clearWindDataCache(): void {
  windDataCache.clear();
  monthlyHistoryCache.clear();
  dailyDataCache.clear();
  hourlyDataCache.clear();
}
