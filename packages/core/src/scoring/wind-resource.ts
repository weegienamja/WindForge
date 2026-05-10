import type { FactorScore, Confidence } from '../types/analysis.js';
import { ScoringFactor } from '../types/analysis.js';
import type { WindDataSummary } from '../types/datasources.js';
import type { ScoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok } from '../types/result.js';
import type { ReconciledWindData } from '../types/reconciliation.js';
import { clamp, linearScale } from '../utils/geo.js';
import { extrapolateWindSpeed, REFERENCE_HEIGHT_M } from '../utils/wind-shear.js';

// Hub-height wind speed thresholds for turbine suitability (m/s)
// Modern turbines: ~3-4 m/s cut-in, optimal at ~12-15 m/s
const MIN_VIABLE_HUB_SPEED_MS = 4.0;
const EXCELLENT_HUB_SPEED_MS = 12.0;

export interface WindScoringParams {
  windData: WindDataSummary;
  weight: number;
  hubHeightM: number;
  windShearAlpha: number;
  /**
   * Optional reanalysis bias-correction outcome. When `confidence === 'high'`
   * the wind-resource factor's confidence ceiling is lifted to `'high'`
   * regardless of `dataYears`.
   */
  reconciliation?: ReconciledWindData | null;
}

export function scoreWindResource(
  params: WindScoringParams,
): Result<FactorScore, ScoringError> {
  const { windData, weight, hubHeightM, windShearAlpha, reconciliation } = params;

  // Use the actual reference height from data (50m when available, 2m otherwise)
  const refHeight = windData.referenceHeightM ?? REFERENCE_HEIGHT_M;

  const hubSpeedMs = extrapolateWindSpeed(
    windData.annualAverageSpeedMs,
    refHeight,
    hubHeightM,
    windShearAlpha,
  );

  const speedScore = computeSpeedScore(hubSpeedMs);
  const consistencyScore = computeConsistencyScore(windData.speedStdDevMs, windData.annualAverageSpeedMs);
  const directionalScore = computeDirectionalScore(windData.directionalConsistency);

  // Speed is most important (60%), consistency (25%), directional stability (15%)
  const rawScore = speedScore * 0.6 + consistencyScore * 0.25 + directionalScore * 0.15;
  const score = Math.round(clamp(rawScore, 0, 100));

  const confidence = determineConfidence(windData, reconciliation ?? null);
  let detail = buildDetail(windData, hubSpeedMs, hubHeightM, refHeight, score, windShearAlpha);
  if (reconciliation && reconciliation.method !== 'none') {
    detail = `${detail} ${reconciliation.detail}`;
  }

  return ok({
    factor: ScoringFactor.WindResource,
    score,
    weight,
    weightedScore: score * weight,
    detail,
    dataSource: `NASA POWER API (${refHeight}m wind speed, 10-year monthly averages)`,
    confidence,
  });
}

function computeSpeedScore(hubSpeedMs: number): number {
  if (hubSpeedMs < MIN_VIABLE_HUB_SPEED_MS) {
    return linearScale(hubSpeedMs, 0, MIN_VIABLE_HUB_SPEED_MS, 0, 20);
  }
  return linearScale(hubSpeedMs, MIN_VIABLE_HUB_SPEED_MS, EXCELLENT_HUB_SPEED_MS, 20, 100);
}

function computeConsistencyScore(stdDevMs: number, meanSpeedMs: number): number {
  if (meanSpeedMs === 0) return 0;
  const cv = stdDevMs / meanSpeedMs;
  return linearScale(cv, 0, 1, 100, 0);
}

function computeDirectionalScore(directionalConsistency: number): number {
  return linearScale(directionalConsistency, 0, 1, 0, 100);
}

function determineConfidence(
  windData: WindDataSummary,
  reconciliation: ReconciledWindData | null,
): Confidence {
  // Reanalysis-corrected with high confidence lifts the ceiling regardless
  // of NASA dataYears.
  if (reconciliation && reconciliation.confidence === 'high') return 'high';
  if (windData.dataYears >= 8) return 'high';
  if (windData.dataYears >= 4) return 'medium';
  return 'low';
}

function buildDetail(
  windData: WindDataSummary,
  hubSpeedMs: number,
  hubHeightM: number,
  refHeight: number,
  score: number,
  windShearAlpha: number,
): string {
  const rawSpeed = windData.annualAverageSpeedMs;
  const hubSpeed = hubSpeedMs.toFixed(1);
  const stdDev = windData.speedStdDevMs.toFixed(1);
  const direction = windData.prevailingDirectionDeg.toFixed(0);
  const consistency = (windData.directionalConsistency * 100).toFixed(0);
  const years = windData.dataYears;

  let quality: string;
  if (score >= 80) quality = 'Excellent';
  else if (score >= 60) quality = 'Good';
  else if (score >= 40) quality = 'Moderate';
  else if (score >= 20) quality = 'Poor';
  else quality = 'Very poor';

  // Show all 3 heights: 2m, 50m, hub
  const speed2m = refHeight === 2
    ? rawSpeed
    : extrapolateWindSpeed(rawSpeed, refHeight, 2, windShearAlpha);
  const speed50m = refHeight === 50
    ? rawSpeed
    : extrapolateWindSpeed(rawSpeed, refHeight, 50, windShearAlpha);

  return (
    `${quality} wind resource. ` +
    `${speed2m.toFixed(1)} m/s at 2m, ${speed50m.toFixed(1)} m/s at 50m, estimated ${hubSpeed} m/s at ${hubHeightM}m hub height. ` +
    `Variability: ${stdDev} m/s. ` +
    `Prevailing direction: ${direction} degrees, ${consistency}% directional consistency. ` +
    `Based on ${years} years of data.`
  );
}
