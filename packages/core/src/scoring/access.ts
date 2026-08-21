import type { FactorScore, Confidence } from '../types/analysis.js';
import { ScoringFactor } from '../types/analysis.js';
import type { ScoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok } from '../types/result.js';
import { clamp, linearScale } from '../utils/geo.js';
import type { RoadAccess } from '../datasources/osm-overpass.js';

export function scoreAccess(roads: RoadAccess, weight: number): Result<FactorScore, ScoringError> {
  let score: number;

  switch (roads.bestRoadCategory) {
    case 'primary':
      if (roads.nearestMajorRoadDistanceKm <= 2) {
        score = linearScale(roads.nearestMajorRoadDistanceKm, 0, 2, 100, 80);
      } else {
        score = linearScale(roads.nearestMajorRoadDistanceKm, 2, 5, 80, 60);
      }
      break;
    case 'secondary':
      if (roads.nearestSecondaryRoadDistanceKm <= 2) {
        score = linearScale(roads.nearestSecondaryRoadDistanceKm, 0, 2, 79, 70);
      } else {
        score = linearScale(roads.nearestSecondaryRoadDistanceKm, 2, 5, 70, 60);
      }
      break;
    case 'minor':
      score = 45;
      break;
    case 'none':
    default:
      score = 10;
      break;
  }

  score = Math.round(clamp(score, 0, 100));

  const confidence = determineConfidence(roads);
  const detail = buildDetail(roads, score);

  return ok({
    factor: ScoringFactor.AccessLogistics,
    score,
    weight,
    weightedScore: score * weight,
    detail,
    dataSource: 'OpenStreetMap Overpass API (road network)',
    confidence,
  });
}

function determineConfidence(roads: RoadAccess): Confidence {
  if (roads.bestRoadCategory !== 'none') return 'high';
  return 'medium';
}

function buildDetail(roads: RoadAccess, score: number): string {
  const parts: string[] = [];

  let quality: string;
  if (score >= 80) quality = 'Excellent access';
  else if (score >= 60) quality = 'Good access';
  else if (score >= 40) quality = 'Moderate access';
  else if (score >= 20) quality = 'Poor access';
  else quality = 'Very poor access';
  parts.push(`${quality}.`);

  if (roads.nearestMajorRoadDistanceKm >= 0) {
    parts.push(
      `Nearest major road (${roads.nearestMajorRoadType}): ${roads.nearestMajorRoadDistanceKm.toFixed(1)}km.`,
    );
  } else {
    parts.push('No major roads found within 5km.');
  }

  if (roads.secondaryRoadCount > 0) {
    parts.push(`${roads.secondaryRoadCount} secondary roads within ${roads.searchRadiusKm}km.`);
  }

  if (roads.bestRoadCategory === 'none') {
    parts.push(
      'No roads were found in the OSM search area; construction access is indeterminate and requires a dedicated logistics review.',
    );
  }

  return parts.join(' ');
}
