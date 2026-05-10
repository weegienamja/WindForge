// Reanalysis bias-correction orchestration.
//
// Combines NASA POWER and an optional ERA5 / CERRA reference into a
// `ReconciledWindData` summary, choosing an appropriate statistical method
// based on the length of overlap. Pure orchestration: all maths lives in
// `bias-correction.ts`.

import type { LatLng } from '../types/analysis.js';
import type { Confidence } from '../types/analysis.js';
import type {
  WindDataSummary,
  MonthlyWindHistory,
  MonthlyWindAverage,
} from '../types/datasources.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import type {
  BiasCorrectionMethod,
  ReferenceSource,
  ReconciledWindData,
  ReconciliationDiagnostics,
} from '../types/reconciliation.js';
import {
  alignByYearMonth,
  applyLinearScaling,
  applyQuantileMapping,
  applyVarianceScaling,
  computeBias,
  computeKsStatistic,
  computeRSquared,
  computeRmse,
} from './bias-correction.js';

/** Shared shape for a paired summary + history from one data source. */
export interface ReconciliationSource {
  readonly summary: WindDataSummary;
  readonly history: MonthlyWindHistory;
}

/** Inputs to {@link reconcileWindData}. */
export interface ReconciliationInput {
  readonly nasa: ReconciliationSource;
  readonly era5: ReconciliationSource | null;
  readonly cerra: ReconciliationSource | null;
  /** Optional override. Defaults to automatic selection by overlap length. */
  readonly method?: BiasCorrectionMethod | 'auto';
}

/**
 * Reconcile NASA POWER monthly wind data against an optional ERA5 or CERRA
 * reference, returning a corrected {@link WindDataSummary} plus diagnostics.
 *
 * Selection rules:
 *  - CERRA is preferred over ERA5 when both are present.
 *  - Auto method: `>= 24` overlap months -> quantile, `>= 12` -> variance,
 *    `< 12` -> none.
 *  - When `method === 'none'` or no reference is supplied the NASA summary
 *    is returned unchanged.
 *
 * Confidence ladder:
 *  - `high`: `overlapMonths >= 24` AND RMSE strictly improved AND |bias|
 *    strictly improved.
 *  - `medium`: correction applied but the high criteria are not all met.
 *  - `low`: no correction applied or correction made RMSE worse (in which
 *    case the corrector falls back to NASA-as-is).
 *
 * @param input Sources and optional method override.
 */
export function reconcileWindData(
  input: ReconciliationInput,
): Result<ReconciledWindData, ScoringError> {
  const { nasa, era5, cerra, method: methodOpt } = input;

  if (!nasa || !nasa.summary || !nasa.history) {
    return err(scoringError(ScoringErrorCode.InsufficientData, 'NASA POWER source is required'));
  }

  // CERRA preferred over ERA5.
  const refSource: ReferenceSource | null = cerra ? 'cerra' : era5 ? 'era5' : null;
  const ref: ReconciliationSource | null = cerra ?? era5 ?? null;

  if (!ref || !refSource) {
    return ok({
      corrected: nasa.summary,
      method: 'none',
      reference: null,
      diagnostics: null,
      confidence: deriveBaseConfidence(nasa.summary),
      detail: 'No reanalysis reference available. Using NASA POWER as-is.',
      correctedSpeedsMs: null,
    });
  }

  const aligned = alignByYearMonth(nasa.history, ref.history);
  const overlapMonths = aligned.nasa.length;

  const method = chooseMethod(methodOpt, overlapMonths);

  if (method === 'none') {
    return ok({
      corrected: nasa.summary,
      method: 'none',
      reference: refSource,
      diagnostics: null,
      confidence: 'low',
      detail: `Insufficient overlap (${overlapMonths} months) for bias correction. Using NASA POWER as-is.`,
      correctedSpeedsMs: null,
    });
  }

  // Apply correction to the full NASA monthly series (not just the overlap window).
  const fullSeries = nasa.history.records.map((r) =>
    bestSpeedMs(r.ws50m, r.ws10m, r.ws2m),
  );
  const correctedSeries = applyMethod(method, fullSeries, aligned.nasa, aligned.reference);

  // Diagnostics on the overlap window.
  const overlapCorrected = applyMethod(method, aligned.nasa, aligned.nasa, aligned.reference);
  const biasBefore = computeBias(aligned.nasa, aligned.reference);
  const biasAfter = computeBias(overlapCorrected, aligned.reference);
  const rmseBefore = computeRmse(aligned.nasa, aligned.reference);
  const rmseAfter = computeRmse(overlapCorrected, aligned.reference);
  const rSquared = computeRSquared(overlapCorrected, aligned.reference);
  const ksStatistic = computeKsStatistic(overlapCorrected, aligned.reference);

  // If correction made RMSE worse, fall back to NASA-as-is and surface why.
  if (rmseAfter > rmseBefore) {
    return ok({
      corrected: nasa.summary,
      method: 'none',
      reference: refSource,
      diagnostics: null,
      confidence: 'low',
      detail:
        `Bias correction (${method}) against ${refSource.toUpperCase()} would have increased RMSE ` +
        `from ${rmseBefore.toFixed(2)} to ${rmseAfter.toFixed(2)} m/s. ` +
        `Falling back to NASA POWER as-is.`,
      correctedSpeedsMs: null,
    });
  }

  const corrected = buildCorrectedSummary(nasa, correctedSeries);
  const confidence = assignConfidence(overlapMonths, biasBefore, biasAfter, rmseBefore, rmseAfter);

  const detail =
    `${methodLabel(method)} against ${refSource.toUpperCase()} over ${overlapMonths} months. ` +
    `Bias reduced from ${signed(biasBefore)} to ${signed(biasAfter)} m/s, ` +
    `RMSE reduced from ${rmseBefore.toFixed(2)} to ${rmseAfter.toFixed(2)} m/s.`;

  const diagnostics: ReconciliationDiagnostics = {
    overlapMonths,
    biasBeforeMs: biasBefore,
    biasAfterMs: biasAfter,
    rmseBeforeMs: rmseBefore,
    rmseAfterMs: rmseAfter,
    rSquared,
    ksStatistic,
  };

  return ok({ corrected, method, reference: refSource, diagnostics, confidence, detail, correctedSpeedsMs: correctedSeries });
}

// ─── Internals ───

function chooseMethod(
  override: BiasCorrectionMethod | 'auto' | undefined,
  overlapMonths: number,
): BiasCorrectionMethod {
  if (override && override !== 'auto') return override;
  if (overlapMonths >= 24) return 'quantile';
  if (overlapMonths >= 12) return 'variance';
  return 'none';
}

function applyMethod(
  method: BiasCorrectionMethod,
  values: number[],
  nasa: number[],
  reference: number[],
): number[] {
  switch (method) {
    case 'quantile':
      return applyQuantileMapping(values, nasa, reference);
    case 'variance':
      return applyVarianceScaling(values, nasa, reference);
    case 'linear':
      return applyLinearScaling(values, nasa, reference);
    case 'none':
      return [...values];
  }
}

function methodLabel(m: BiasCorrectionMethod): string {
  switch (m) {
    case 'quantile':
      return 'Quantile-mapped';
    case 'variance':
      return 'Variance-scaled';
    case 'linear':
      return 'Linearly scaled';
    case 'none':
      return 'Unchanged';
  }
}

function signed(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2);
}

function bestSpeedMs(ws50: number, ws10: number, ws2: number): number {
  if (ws50 > 0) return ws50;
  if (ws10 > 0) return ws10;
  return ws2;
}

function deriveBaseConfidence(s: WindDataSummary): Confidence {
  if (s.dataYears >= 8) return 'high';
  if (s.dataYears >= 4) return 'medium';
  return 'low';
}

function assignConfidence(
  overlapMonths: number,
  biasBefore: number,
  biasAfter: number,
  rmseBefore: number,
  rmseAfter: number,
): Confidence {
  const improvedRmse = rmseAfter < rmseBefore;
  const improvedBias = Math.abs(biasAfter) < Math.abs(biasBefore);
  if (overlapMonths >= 24 && improvedRmse && improvedBias) return 'high';
  return 'medium';
}

/**
 * Build a corrected `WindDataSummary` by recomputing mean, sd, monthly
 * averages and Weibull k/c from the corrected full series. `dataYears`
 * and metadata coordinates are preserved from the NASA original.
 */
function buildCorrectedSummary(
  nasa: ReconciliationSource,
  corrected: number[],
): WindDataSummary {
  const orig = nasa.summary;
  const records = nasa.history.records;
  const n = Math.min(records.length, corrected.length);
  const meanMs = arrMean(corrected.slice(0, n));
  const sdMs = arrSd(corrected.slice(0, n), meanMs);

  // Monthly averages: average corrected speeds within each calendar month.
  const byMonth = new Map<number, number[]>();
  const byMonthDir = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = records[i] as { month: number; wd50m: number; wd10m: number };
    const v = corrected[i] as number;
    if (!byMonth.has(r.month)) byMonth.set(r.month, []);
    if (!byMonthDir.has(r.month)) byMonthDir.set(r.month, []);
    byMonth.get(r.month)?.push(v);
    byMonthDir.get(r.month)?.push(r.wd50m > 0 ? r.wd50m : r.wd10m);
  }
  const monthlyAverages: MonthlyWindAverage[] = [];
  for (let m = 1; m <= 12; m++) {
    const speeds = byMonth.get(m);
    const dirs = byMonthDir.get(m);
    if (!speeds || speeds.length === 0) continue;
    monthlyAverages.push({
      month: m,
      averageSpeedMs: arrMean(speeds),
      averageDirectionDeg: dirs && dirs.length > 0 ? arrMean(dirs) : orig.prevailingDirectionDeg,
    });
  }

  const weibull = fitWeibullFromStats(meanMs, sdMs);

  const result: WindDataSummary = {
    coordinate: { lat: orig.coordinate.lat, lng: orig.coordinate.lng } satisfies LatLng,
    monthlyAverages: monthlyAverages.length > 0 ? monthlyAverages : orig.monthlyAverages,
    annualAverageSpeedMs: meanMs,
    speedStdDevMs: sdMs,
    prevailingDirectionDeg: orig.prevailingDirectionDeg,
    directionalConsistency: orig.directionalConsistency,
    dataYears: orig.dataYears,
    weibullK: weibull.k,
    weibullC: weibull.c,
  };
  if (orig.referenceHeightM !== undefined) {
    return { ...result, referenceHeightM: orig.referenceHeightM };
  }
  return result;
}

function arrMean(a: number[]): number {
  if (a.length === 0) return 0;
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}

function arrSd(a: number[], m: number): number {
  if (a.length === 0) return 0;
  let s = 0;
  for (const v of a) s += (v - m) * (v - m);
  return Math.sqrt(s / a.length);
}

/** Justus method-of-moments Weibull fit; uses Lanczos gamma for c. */
function fitWeibullFromStats(meanSpeed: number, sdSpeed: number): { k: number; c: number } {
  if (meanSpeed <= 0 || sdSpeed <= 0) {
    return { k: 2.0, c: meanSpeed > 0 ? meanSpeed * 1.128 : 1 };
  }
  const cov = sdSpeed / meanSpeed;
  const k = Math.max(1.0, Math.min(10.0, cov ** -1.086));
  const c = meanSpeed / lanczosGamma(1 + 1 / k);
  return { k, c };
}

function lanczosGamma(n: number): number {
  if (n < 0.5) return Math.PI / (Math.sin(Math.PI * n) * lanczosGamma(1 - n));
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  const x = n - 1;
  let sum = coef[0] as number;
  for (let i = 1; i < g + 2; i++) sum += (coef[i] as number) / (x + i);
  const t = x + g + 0.5;
  return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * sum;
}
