// Reanalysis bias-correction type contract.
//
// These types describe the inputs and outputs of statistical bias correction
// of NASA POWER monthly wind speed against ERA5 or CERRA reanalysis data.

import type { Confidence } from './analysis.js';
import type { WindDataSummary } from './datasources.js';

/**
 * Statistical method used to correct NASA POWER speeds against a reference.
 *  - `quantile`: empirical CDF mapping (preferred for >= 24 months overlap).
 *  - `variance`: mean and standard deviation scaling (>= 12 months overlap).
 *  - `linear`: ordinary least squares regression (manual override).
 *  - `none`: no correction applied (insufficient overlap or no reference).
 */
export type BiasCorrectionMethod = 'quantile' | 'variance' | 'linear' | 'none';

/** Supported reanalysis reference datasets. */
export type ReferenceSource = 'cerra' | 'era5';

/**
 * Diagnostics computed on the overlap window between NASA POWER and the
 * chosen reference dataset. All units are m/s except `rSquared` and
 * `ksStatistic`, which are dimensionless (0..1).
 */
export interface ReconciliationDiagnostics {
  readonly overlapMonths: number;
  readonly biasBeforeMs: number;
  readonly biasAfterMs: number;
  readonly rmseBeforeMs: number;
  readonly rmseAfterMs: number;
  readonly rSquared: number;
  readonly ksStatistic: number;
}

/**
 * Outcome of a reconciliation run. When `method === 'none'`,
 * `corrected` is the unchanged NASA summary and `diagnostics` is null.
 */
export interface ReconciledWindData {
  readonly corrected: WindDataSummary;
  readonly method: BiasCorrectionMethod;
  readonly reference: ReferenceSource | null;
  readonly diagnostics: ReconciliationDiagnostics | null;
  readonly confidence: Confidence;
  readonly detail: string;
  /**
   * Per-record bias-corrected speeds in m/s, aligned 1:1 with the input
   * NASA history records. Set only when an actual correction was applied
   * (`method !== 'none'`); otherwise `null`.
   */
  readonly correctedSpeedsMs: readonly number[] | null;
}
