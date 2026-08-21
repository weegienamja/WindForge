import type { FactorScore, Confidence } from '../types/analysis.js';
import { ScoringFactor } from '../types/analysis.js';
import type { ElevationData } from '../types/datasources.js';
import type { ScoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok } from '../types/result.js';
import { clamp, linearScale } from '../utils/geo.js';

// Slope thresholds for turbine construction
const IDEAL_MAX_SLOPE_PERCENT = 5;
const PROHIBITIVE_SLOPE_PERCENT = 30;

// Elevation is an access/construction screening proxy, not a wind-resource bonus.
const LOW_ELEVATION_M = 250;
const UPLAND_ELEVATION_M = 1000;
const CHALLENGING_ELEVATION_M = 2500;

export function scoreTerrainSuitability(
  elevationData: ElevationData,
  weight: number,
): Result<FactorScore, ScoringError> {
  const slopeScore = computeSlopeScore(elevationData.slopePercent);
  const elevationScore = computeElevationScore(elevationData.elevationM);
  // Only topographic evidence is used. The legacy `roughnessClass` field is
  // derived from the same elevation samples and is not land-cover evidence.
  const rawScore = slopeScore * 0.75 + elevationScore * 0.25;
  const score = Math.round(clamp(rawScore, 0, 100));

  const confidence = determineConfidence(elevationData);
  const detail = buildDetail(elevationData, score);

  return ok({
    factor: ScoringFactor.TerrainSuitability,
    score,
    weight,
    weightedScore: score * weight,
    detail,
    dataSource: 'Open-Elevation API (provider elevation samples)',
    confidence,
  });
}

function computeSlopeScore(slopePercent: number): number {
  if (slopePercent >= PROHIBITIVE_SLOPE_PERCENT) return 0;
  if (slopePercent <= IDEAL_MAX_SLOPE_PERCENT) {
    return linearScale(slopePercent, 0, IDEAL_MAX_SLOPE_PERCENT, 100, 80);
  }
  return linearScale(slopePercent, IDEAL_MAX_SLOPE_PERCENT, PROHIBITIVE_SLOPE_PERCENT, 80, 0);
}

function computeElevationScore(elevationM: number): number {
  if (elevationM < 0) {
    // Below sea level, likely coastal/flood risk
    return linearScale(elevationM, -50, 0, 30, 60);
  }
  if (elevationM <= LOW_ELEVATION_M) {
    return linearScale(elevationM, 0, LOW_ELEVATION_M, 90, 100);
  }
  if (elevationM <= UPLAND_ELEVATION_M) {
    return linearScale(elevationM, LOW_ELEVATION_M, UPLAND_ELEVATION_M, 100, 75);
  }
  return linearScale(elevationM, UPLAND_ELEVATION_M, CHALLENGING_ELEVATION_M, 75, 20);
}

function determineConfidence(elevationData: ElevationData): Confidence {
  // Open-Elevation does not provide a stable resolution/provenance guarantee.
  if (elevationData.elevationM > 3000 || elevationData.elevationM < -10) return 'low';
  return 'medium';
}

function buildDetail(elevationData: ElevationData, score: number): string {
  const elevation = elevationData.elevationM.toFixed(0);
  const slope = elevationData.slopePercent.toFixed(1);
  const aspect = elevationData.aspectDeg.toFixed(0);
  let quality: string;
  if (score >= 80) quality = 'Fewer topographic screening concerns';
  else if (score >= 60) quality = 'Moderate topographic screening concerns';
  else if (score >= 40) quality = 'Material topographic screening concerns';
  else quality = 'Strong topographic screening concerns';

  return (
    `${quality}. ` +
    `Elevation: ${elevation}m, derived slope: ${slope}%, derived aspect: ${aspect} degrees. ` +
    'No land-cover or aerodynamic roughness dataset was used.'
  );
}
