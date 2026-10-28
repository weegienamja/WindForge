import { type ScoringError, ScoringErrorCode, scoringError } from '../types/errors.js';
import { err, ok, type Result } from '../types/result.js';
import type { OsmGeometryMember, OsmGeometryPoint } from '../utils/feature-geometry.js';

// All three mirrors cover the world. Queries use bounding boxes, not area IDs
// (the OSM France mirror does not support area queries).
const ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
] as const;

// Leave time for a complete fallback within the demo's 45-second deadline.
// The HTTP budget includes queueing and transferring full feature geometry.
export const OVERPASS_TIMEOUT_S = 10;
const REQUEST_TIMEOUT_MS = 12_000;

export interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: OsmGeometryPoint[];
  members?: OsmGeometryMember[];
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
  /** OSM replication timestamp reported by the mirror, not the fetch time. */
  osmBaseTimestamp?: string;
}

function cancelled(): Result<never, ScoringError> {
  return err(scoringError(ScoringErrorCode.Timeout, 'Overpass query cancelled'));
}

async function requestOverpass(
  endpoint: string,
  query: string,
  signal?: AbortSignal,
): Promise<Result<OverpassResponse, ScoringError>> {
  if (signal?.aborted) return cancelled();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'WindForge/0.3 (+https://github.com/weegienamja/WindForge)',
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const transient =
        response.status === 429 || response.status === 406 || response.status >= 500;
      // Release the response before opening a connection to another provider.
      await response.body?.cancel();
      return err(
        scoringError(
          ScoringErrorCode.DataFetchFailed,
          `Overpass API HTTP ${response.status}`,
          transient ? new Error('transient upstream response') : undefined,
        ),
      );
    }

    const data: unknown = await response.json();
    if (controller.signal.aborted) {
      return err(
        scoringError(
          ScoringErrorCode.Timeout,
          'Overpass API request timed out',
          new Error('timeout'),
        ),
      );
    }
    if (!data || typeof data !== 'object') {
      return err(scoringError(ScoringErrorCode.ParseError, 'Overpass returned an invalid payload'));
    }
    // Overpass can return HTTP 200 with partial (or empty) elements AND a runtime
    // error. Such results cannot establish that a site has no constraints.
    const remark = (data as { remark?: unknown }).remark;
    if (typeof remark === 'string' && remark.trim()) {
      const timedOut = /timed?\s*out/i.test(remark);
      return err(
        scoringError(
          timedOut ? ScoringErrorCode.Timeout : ScoringErrorCode.DataFetchFailed,
          timedOut
            ? 'Overpass query timed out; incomplete data discarded'
            : 'Overpass returned incomplete data',
          new Error('upstream query did not complete'),
        ),
      );
    }
    if (!Array.isArray((data as OverpassResponse).elements)) {
      return err(scoringError(ScoringErrorCode.ParseError, 'Overpass returned an invalid payload'));
    }
    const rawTimestamp = (data as { osm3s?: { timestamp_osm_base?: unknown } }).osm3s
      ?.timestamp_osm_base;
    const timestamp = typeof rawTimestamp === 'string' ? Date.parse(rawTimestamp) : Number.NaN;
    return ok({
      elements: (data as OverpassResponse).elements,
      ...(Number.isFinite(timestamp)
        ? { osmBaseTimestamp: new Date(timestamp).toISOString() }
        : {}),
    });
  } catch (cause) {
    const timedOut = controller.signal.aborted;
    const parseError = cause instanceof SyntaxError;
    return err(
      scoringError(
        timedOut
          ? ScoringErrorCode.Timeout
          : parseError
            ? ScoringErrorCode.ParseError
            : ScoringErrorCode.DataFetchFailed,
        timedOut
          ? 'Overpass API request timed out'
          : parseError
            ? 'Overpass returned invalid JSON'
            : 'Overpass API request failed',
        cause,
      ),
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Retry only transient failures, once per independent mirror, without a sleep
 * that consumes the remaining analysis budget. Never retry a caller cancellation.
 */
export async function queryOverpass(
  query: string,
  signal?: AbortSignal,
): Promise<Result<OverpassResponse, ScoringError>> {
  let result: Result<OverpassResponse, ScoringError> = cancelled();
  for (const endpoint of ENDPOINTS) {
    if (signal?.aborted) return cancelled();
    result = await requestOverpass(endpoint, query, signal);
    if (signal?.aborted) return cancelled();
    if (result.ok || !result.error.cause || result.error.code === ScoringErrorCode.ParseError) {
      return result;
    }
  }
  return result;
}
