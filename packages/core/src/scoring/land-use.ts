import type { FactorScore, Constraint } from '../types/analysis.js';
import { ScoringFactor } from '../types/analysis.js';
import type { ScoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok } from '../types/result.js';
import { clamp } from '../utils/geo.js';
import type { LandUseResult } from '../datasources/osm-overpass.js';

interface LandUseScoreResult {
  factorScore: FactorScore;
  hardConstraints: Constraint[];
}

export function scoreLandUse(
  landUse: LandUseResult,
  weight: number,
): Result<LandUseScoreResult, ScoringError> {
  const hardConstraints: Constraint[] = [];

  // Hard constraint: score 0 immediately
  if (landUse.hardConstraints.length > 0) {
    for (const hc of landUse.hardConstraints) {
      hardConstraints.push({
        factor: ScoringFactor.LandUseCompatibility,
        description: hc.description,
        severity: 'blocking',
      });
    }

    return ok({
      factorScore: {
        factor: ScoringFactor.LandUseCompatibility,
        score: 0,
        weight,
        weightedScore: 0,
        detail: buildDetail(landUse, 0),
        dataSource: 'OpenStreetMap Overpass API (land use designations)',
        confidence: 'high',
      },
      hardConstraints,
    });
  }

  // Start from base score
  let score = 70;

  // Deduplicate soft constraints by type — count occurrences but only penalise once per type
  const softByType = new Map<string, { count: number; nearest: number; description: string }>();
  for (const sc of landUse.softConstraints) {
    const existing = softByType.get(sc.type);
    if (!existing) {
      softByType.set(sc.type, { count: 1, nearest: sc.distanceKm, description: sc.description });
    } else {
      existing.count++;
      if (sc.distanceKm < existing.nearest) {
        existing.nearest = sc.distanceKm;
        existing.description = sc.description;
      }
    }
  }

  // Deduct once per constraint type
  for (const [type] of softByType) {
    switch (type) {
      case 'residential':
        score -= 20;
        break;
      case 'water':
        score -= 10;
        break;
      case 'forest':
        score -= 15;
        break;
      default:
        score -= 5;
    }
  }

  // Boost for positive indicators
  score += landUse.positiveIndicators.length * 10;

  score = Math.round(clamp(score, 0, 100));

  return ok({
    factorScore: {
      factor: ScoringFactor.LandUseCompatibility,
      score,
      weight,
      weightedScore: score * weight,
      detail: buildDetail(landUse, score),
      dataSource: 'OpenStreetMap Overpass API (land use designations)',
      confidence: landUse.hardConstraints.length + landUse.softConstraints.length + landUse.positiveIndicators.length > 0 ? 'high' : 'medium',
    },
    hardConstraints,
  });
}

function buildDetail(landUse: LandUseResult, score: number): string {
  const parts: string[] = [];

  let quality: string;
  if (score >= 80) quality = 'Highly compatible land use';
  else if (score >= 60) quality = 'Compatible land use';
  else if (score >= 40) quality = 'Some land use concerns';
  else if (score >= 20) quality = 'Significant land use issues';
  else quality = 'Incompatible land use';
  parts.push(`${quality}.`);

  if (landUse.hardConstraints.length > 0) {
    const types = landUse.hardConstraints.map((hc) => hc.type).join(', ');
    parts.push(`BLOCKED: ${types}.`);
  }

  if (landUse.positiveIndicators.length > 0) {
    parts.push(`${landUse.positiveIndicators.join(', ')} (positive).`);
  }

  if (landUse.softConstraints.length > 0) {
    // Deduplicate: group by type and summarise
    const byType = new Map<string, { count: number; description: string }>();
    for (const sc of landUse.softConstraints) {
      const existing = byType.get(sc.type);
      if (!existing) {
        byType.set(sc.type, { count: 1, description: sc.description });
      } else {
        existing.count++;
      }
    }
    const summaries = [...byType.values()].map((v) =>
      v.count > 1 ? `${v.description} (${v.count} features)` : v.description,
    );
    parts.push(summaries.join('. ') + '.');
  }

  if (landUse.hardConstraints.length === 0 && landUse.softConstraints.length === 0 && landUse.positiveIndicators.length === 0) {
    parts.push('No significant land use data found in area.');
  }

  return parts.join(' ');
}
