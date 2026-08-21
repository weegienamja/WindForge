// CERRA reanalysis data source client.
//
// CERRA parsing and domain helpers. Automated retrieval is deliberately
// disabled until the sub-daily product has a reviewed aggregation path; this
// module must not imply that higher spatial resolution equals better evidence.

import type { LatLng } from '../types/analysis.js';
import type { WindDataSummary } from '../types/datasources.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';

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
 * Report why automated CERRA retrieval is unavailable for this release.
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
  void options;
  if (!apiKey || apiKey.trim().length === 0) {
    return err(
      scoringError(ScoringErrorCode.DataFetchFailed, 'CDS API key is required for CERRA data'),
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

  return err(
    scoringError(
      ScoringErrorCode.Configuration,
      'CERRA correction is disabled: the available sub-daily product is not aggregated into defensible monthly means by this release. Use reviewed ERA5 monthly means or raw NASA POWER data.',
    ),
  );
}

export function clearCerraCache(): void {
  // No network cache while automated CERRA retrieval is disabled.
}

// ─── Phase 5: Monthly history fetcher ───

import { NetCDFReader } from 'netcdfjs';
import type { MonthlyWindRecord } from '../types/datasources.js';
import type { ReanalysisSource } from '../types/analysis.js';

export interface CerraHistoryOptions {
  readonly startYear?: number;
  readonly endYear?: number;
  readonly cdsApiKey?: string;
  readonly cdsApiUrl?: string;
  readonly maxPollSeconds?: number;
  readonly pollIntervalSeconds?: number;
  readonly signal?: AbortSignal;
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

  return err(
    scoringError(
      ScoringErrorCode.Configuration,
      'CERRA automated correction is disabled in this release because one sub-daily sample per month is not a valid monthly climatology.',
    ),
  );
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
    return err(
      scoringError(ScoringErrorCode.ParseError, 'Failed to open CERRA NetCDF payload', cause),
    );
  }

  const speedName = pickCerraVariable(nc, ['si10', '10m_wind_speed', 'ws10', 'wind_speed']);
  if (!speedName) {
    return err(
      scoringError(ScoringErrorCode.ParseError, 'CERRA NetCDF missing 10m wind speed variable'),
    );
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
    return err(
      scoringError(ScoringErrorCode.ParseError, 'CERRA NetCDF missing required variables', cause),
    );
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
      ws2m: null,
      ws10m: speed,
      ws50m: null,
      wd10m: null,
      wd50m: null,
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
