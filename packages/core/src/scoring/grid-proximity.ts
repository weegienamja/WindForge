import type { FactorScore, Confidence } from '../types/analysis.js';
import { ScoringFactor } from '../types/analysis.js';
import type { ScoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok } from '../types/result.js';
import { clamp, linearScale } from '../utils/geo.js';
import type { GridInfrastructure } from '../datasources/osm-overpass.js';

export function scoreGridProximity(
  grid: GridInfrastructure,
  weight: number,
): Result<FactorScore, ScoringError> {
  const hasLines = grid.nearestLineDistanceKm >= 0;
  const hasSubstations = grid.nearestSubstationDistanceKm >= 0;

  let lineScore: number;
  let substationScore: number;

  if (!hasLines) {
    lineScore = 0;
  } else {
    lineScore = scoreDistanceKm(grid.nearestLineDistanceKm);
  }

  if (!hasSubstations) {
    substationScore = 0;
  } else {
    substationScore = scoreDistanceKm(grid.nearestSubstationDistanceKm);
  }

  // Substations weighted slightly higher (60%) than lines (40%)
  const rawScore = substationScore * 0.6 + lineScore * 0.4;
  const score = Math.round(clamp(rawScore, 0, 100));

  const confidence = determineConfidence(grid);
  const detail = buildDetail(grid, score);

  return ok({
    factor: ScoringFactor.GridProximity,
    score,
    weight,
    weightedScore: score * weight,
    detail,
    dataSource: 'OpenStreetMap Overpass API (transmission lines, substations)',
    confidence,
  });
}

function scoreDistanceKm(distanceKm: number): number {
  if (distanceKm < 5) return linearScale(distanceKm, 0, 5, 100, 90);
  if (distanceKm < 15) return linearScale(distanceKm, 5, 15, 89, 70);
  if (distanceKm < 30) return linearScale(distanceKm, 15, 30, 69, 40);
  if (distanceKm < 50) return linearScale(distanceKm, 30, 50, 39, 20);
  return linearScale(distanceKm, 50, 100, 19, 0);
}

function determineConfidence(grid: GridInfrastructure): Confidence {
  if (grid.searchRadiusKm <= 50 && (grid.lineCount > 0 || grid.substationCount > 0)) return 'high';
  if (grid.searchRadiusKm > 50) return 'medium';
  return 'medium';
}

function buildDetail(grid: GridInfrastructure, score: number): string {
  const parts: string[] = [];

  let quality: string;
  if (score >= 80) quality = 'Excellent grid access';
  else if (score >= 60) quality = 'Good grid access';
  else if (score >= 40) quality = 'Moderate grid access';
  else if (score >= 20) quality = 'Poor grid access';
  else quality = 'Very poor grid access';
  parts.push(`${quality}.`);

  if (grid.nearestLineDistanceKm >= 0) {
    parts.push(`Nearest transmission line: ${grid.nearestLineDistanceKm.toFixed(1)}km.`);
  } else {
    parts.push(`No transmission lines found within ${grid.searchRadiusKm}km.`);
  }

  if (grid.nearestSubstationDistanceKm >= 0) {
    parts.push(`Nearest substation: ${grid.nearestSubstationDistanceKm.toFixed(1)}km.`);
  } else {
    parts.push(`No substations found within ${grid.searchRadiusKm}km.`);
  }

  parts.push(
    `${grid.lineCount} lines, ${grid.substationCount} substations within ${grid.searchRadiusKm}km.`,
  );

  return parts.join(' ');
}
