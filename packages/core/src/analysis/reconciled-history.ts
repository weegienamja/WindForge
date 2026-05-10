// Thin orchestrator: fetch NASA POWER monthly history plus optional ERA5 /
// CERRA history, run the bias-correction pipeline, and return both the raw
// and corrected monthly histories ready for charting.
//
// All bias-correction maths lives in `reanalysis-reconciliation.ts`. This
// module only orchestrates fetches and shapes the corrected speed series
// back into a `MonthlyWindHistory`.

import type { LatLng } from '../types/analysis.js';
import type { MonthlyWindHistory, MonthlyWindRecord } from '../types/datasources.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import type { ReconciledWindData } from '../types/reconciliation.js';
import { fetchMonthlyWindHistory, fetchWindData } from '../datasources/nasa-power.js';
import { fetchEra5MonthlyHistory } from '../datasources/era5.js';
import { fetchCerraMonthlyHistory, isInCerraDomain } from '../datasources/cerra.js';
import { reconcileWindData } from './reanalysis-reconciliation.js';

export interface FetchReconciledWindHistoryOptions {
  /** Optional CDS API key for ERA5 / CERRA. Falls back to `CDS_API_KEY` env. */
  readonly cdsApiKey?: string;
  /** Override years of NASA POWER history to fetch (default 10). */
  readonly yearsBack?: number;
  readonly signal?: AbortSignal;
}

export interface ReconciledWindHistory {
  readonly raw: MonthlyWindHistory;
  readonly corrected: MonthlyWindHistory | null;
  readonly reconciliation: ReconciledWindData | null;
}

/**
 * Fetch NASA POWER monthly history and, when a CDS API key is available,
 * also fetch CERRA / ERA5 reanalysis history. Run the same bias-correction
 * pipeline used by `analyseSite` and return both the raw and corrected
 * monthly histories.
 *
 * The corrected history is `null` when no reference is available, when
 * overlap is too short, or when the correction would have made RMSE worse.
 */
export async function fetchReconciledWindHistory(
  coordinate: LatLng,
  options: FetchReconciledWindHistoryOptions = {},
): Promise<Result<ReconciledWindHistory, ScoringError>> {
  const { yearsBack, signal } = options;
  const cdsApiKey = options.cdsApiKey ?? process.env.CDS_API_KEY ?? '';

  const nasaHistoryResult = await fetchMonthlyWindHistory(coordinate, yearsBack, signal);
  if (!nasaHistoryResult.ok) return nasaHistoryResult;
  const nasaHistory = nasaHistoryResult.value;

  // Without a CDS key we cannot fetch reanalysis. Return raw only.
  if (cdsApiKey.trim().length === 0) {
    return ok({ raw: nasaHistory, corrected: null, reconciliation: null });
  }

  // Need a NASA summary too for reconcileWindData.
  const nasaSummaryResult = await fetchWindData(coordinate, signal);
  if (!nasaSummaryResult.ok) {
    // Still return the raw history; chart can degrade.
    return ok({ raw: nasaHistory, corrected: null, reconciliation: null });
  }

  const refFetches: Array<Promise<{ source: 'era5' | 'cerra'; result: Awaited<ReturnType<typeof fetchEra5MonthlyHistory>> }>> = [];
  refFetches.push(
    fetchEra5MonthlyHistory(coordinate, { cdsApiKey, ...(signal ? { signal } : {}) }).then((result) => ({
      source: 'era5' as const,
      result,
    })),
  );
  if (isInCerraDomain(coordinate)) {
    refFetches.push(
      fetchCerraMonthlyHistory(coordinate, { cdsApiKey, ...(signal ? { signal } : {}) }).then((result) => ({
        source: 'cerra' as const,
        result,
      })),
    );
  }

  const settled = await Promise.allSettled(refFetches);
  let era5: { summary: typeof nasaSummaryResult.value; history: MonthlyWindHistory } | null = null;
  let cerra: { summary: typeof nasaSummaryResult.value; history: MonthlyWindHistory } | null = null;
  for (const s of settled) {
    if (s.status !== 'fulfilled' || !s.value.result.ok) continue;
    if (s.value.source === 'era5') era5 = s.value.result.value;
    else cerra = s.value.result.value;
  }

  if (!era5 && !cerra) {
    return ok({ raw: nasaHistory, corrected: null, reconciliation: null });
  }

  const reconciled = reconcileWindData({
    nasa: { summary: nasaSummaryResult.value, history: nasaHistory },
    era5: era5 ? { summary: era5.summary, history: era5.history } : null,
    cerra: cerra ? { summary: cerra.summary, history: cerra.history } : null,
  });

  if (!reconciled.ok) {
    return err(scoringError(ScoringErrorCode.InsufficientData, reconciled.error.message));
  }

  const corrected = buildCorrectedHistory(nasaHistory, reconciled.value.correctedSpeedsMs);
  return ok({ raw: nasaHistory, corrected, reconciliation: reconciled.value });
}

function buildCorrectedHistory(
  raw: MonthlyWindHistory,
  correctedSpeedsMs: readonly number[] | null,
): MonthlyWindHistory | null {
  if (!correctedSpeedsMs) return null;
  const n = Math.min(raw.records.length, correctedSpeedsMs.length);
  if (n === 0) return null;

  // Replace the best-available height (50m if present, else 10m, else 2m) with
  // the corrected speed so downstream consumers can read it from `ws50m`/etc.
  // We populate ws50m with the corrected value because the chart treats 50m
  // as the canonical wind-resource series and falls back gracefully.
  const records: MonthlyWindRecord[] = [];
  for (let i = 0; i < n; i++) {
    const r = raw.records[i] as MonthlyWindRecord;
    const corrected = correctedSpeedsMs[i] as number;
    records.push({
      year: r.year,
      month: r.month,
      ws2m: r.ws2m,
      ws10m: r.ws10m,
      ws50m: corrected,
      wd10m: r.wd10m,
      wd50m: r.wd50m,
    });
  }

  return {
    coordinate: raw.coordinate,
    records,
    startYear: raw.startYear,
    endYear: raw.endYear,
  };
}
