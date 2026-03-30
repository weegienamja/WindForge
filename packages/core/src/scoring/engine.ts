import type {
  ScoringWeights,
  FactorScore,
  Constraint,
  Warning,
  SiteAnalysis,
  AnalysisOptions,
} from '../types/analysis.js';
import { ScoringFactor } from '../types/analysis.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { fetchWindData } from '../datasources/nasa-power.js';
import { fetchElevationData } from '../datasources/open-elevation.js';
import { fetchGridInfrastructure, fetchLandUse, fetchRoadAccess, fetchNearbyWindFarms } from '../datasources/osm-overpass.js';
import { reverseGeocode } from '../datasources/nominatim.js';
import { scoreWindResource } from './wind-resource.js';
import { scoreTerrainSuitability } from './terrain-suitability.js';
import { scoreGridProximity } from './grid-proximity.js';
import { scoreLandUse } from './land-use.js';
import { scorePlanning } from './planning.js';
import { scoreAccess } from './access.js';
import { isValidCoordinate } from '../utils/geo.js';
import { roughnessClassToAlpha } from '../utils/wind-shear.js';

const HARD_CONSTRAINT_THRESHOLD = 20;
const DEFAULT_HUB_HEIGHT_M = 80;

export const DEFAULT_WEIGHTS: ScoringWeights = {
  windResource: 0.35,
  terrainSuitability: 0.20,
  gridProximity: 0.15,
  landUseCompatibility: 0.15,
  planningFeasibility: 0.10,
  accessLogistics: 0.05,
};

export function normaliseWeights(partial: Partial<ScoringWeights>): Result<ScoringWeights, ScoringError> {
  const merged = { ...DEFAULT_WEIGHTS, ...partial };
  const sum =
    merged.windResource +
    merged.terrainSuitability +
    merged.gridProximity +
    merged.landUseCompatibility +
    merged.planningFeasibility +
    merged.accessLogistics;

  if (sum <= 0) {
    return err(scoringError(ScoringErrorCode.InvalidWeights, 'Weights must sum to a positive number'));
  }

  // Normalise to sum to 1.0
  return ok({
    windResource: merged.windResource / sum,
    terrainSuitability: merged.terrainSuitability / sum,
    gridProximity: merged.gridProximity / sum,
    landUseCompatibility: merged.landUseCompatibility / sum,
    planningFeasibility: merged.planningFeasibility / sum,
    accessLogistics: merged.accessLogistics / sum,
  });
}

export async function analyseSite(
  options: AnalysisOptions,
): Promise<Result<SiteAnalysis, ScoringError>> {
  const startTime = Date.now();
  const { coordinate } = options;
  const hubHeightM = options.hubHeightM ?? DEFAULT_HUB_HEIGHT_M;
  const signal = options.signal;

  if (!isValidCoordinate(coordinate)) {
    return err(
      scoringError(
        ScoringErrorCode.InvalidCoordinate,
        `Invalid coordinate: lat=${coordinate.lat}, lng=${coordinate.lng}`,
      ),
    );
  }

  const weightsResult = normaliseWeights(options.weights ?? {});
  if (!weightsResult.ok) {
    return weightsResult;
  }
  const weights = weightsResult.value;

  // Fetch all data in parallel using Promise.allSettled so one failure does not block others
  const [windSettled, elevationSettled, gridSettled, landUseSettled, roadSettled, windFarmSettled, geocodeSettled] =
    await Promise.allSettled([
      fetchWindData(coordinate, signal),
      fetchElevationData(coordinate, signal),
      fetchGridInfrastructure(coordinate, signal),
      fetchLandUse(coordinate, signal),
      fetchRoadAccess(coordinate, signal),
      fetchNearbyWindFarms(coordinate, signal),
      reverseGeocode(coordinate, signal),
    ]);

  const windResult = windSettled.status === 'fulfilled' ? windSettled.value : null;
  const elevationResult = elevationSettled.status === 'fulfilled' ? elevationSettled.value : null;
  const gridResult = gridSettled.status === 'fulfilled' ? gridSettled.value : null;
  const landUseResult = landUseSettled.status === 'fulfilled' ? landUseSettled.value : null;
  const roadResult = roadSettled.status === 'fulfilled' ? roadSettled.value : null;
  const windFarmResult = windFarmSettled.status === 'fulfilled' ? windFarmSettled.value : null;
  const geocodeResult = geocodeSettled.status === 'fulfilled' ? geocodeSettled.value : null;

  const factors: FactorScore[] = [];
  const hardConstraints: Constraint[] = [];
  const warnings: Warning[] = [];
  const sourcesUsed: string[] = [];
  const sourcesFailed: string[] = [];
  const dataFreshness: Record<string, string> = {};

  // Derive wind shear alpha from terrain roughness (fall back to open terrain)
  const roughnessClass = elevationResult?.ok ? elevationResult.value.roughnessClass : 1;
  const windShearAlpha = roughnessClassToAlpha(roughnessClass);

  // --- Wind resource ---
  if (windResult?.ok) {
    const windScore = scoreWindResource({
      windData: windResult.value,
      weight: weights.windResource,
      hubHeightM,
      windShearAlpha,
    });
    if (windScore.ok) {
      factors.push(windScore.value);
      sourcesUsed.push('NASA POWER');
      dataFreshness[ScoringFactor.WindResource] = 'Historical monthly data';
      checkConstraints(windScore.value, hardConstraints, warnings);
    }
  } else {
    factors.push(createFallbackFactor(ScoringFactor.WindResource, weights.windResource, 'Wind data unavailable'));
    sourcesFailed.push('NASA POWER');
    const msg = windResult && !windResult.ok ? windResult.error.message : 'Wind data fetch rejected';
    warnings.push({ factor: ScoringFactor.WindResource, description: `Wind data fetch failed: ${msg}` });
  }

  // --- Terrain ---
  if (elevationResult?.ok) {
    const terrainScore = scoreTerrainSuitability(elevationResult.value, weights.terrainSuitability);
    if (terrainScore.ok) {
      factors.push(terrainScore.value);
      sourcesUsed.push('Open-Elevation');
      dataFreshness[ScoringFactor.TerrainSuitability] = 'SRTM elevation data';
      checkConstraints(terrainScore.value, hardConstraints, warnings);
    }
  } else {
    factors.push(createFallbackFactor(ScoringFactor.TerrainSuitability, weights.terrainSuitability, 'Elevation data unavailable'));
    sourcesFailed.push('Open-Elevation');
    const msg = elevationResult && !elevationResult.ok ? elevationResult.error.message : 'Elevation fetch rejected';
    warnings.push({ factor: ScoringFactor.TerrainSuitability, description: `Elevation data fetch failed: ${msg}` });
  }

  // --- Grid proximity ---
  if (gridResult?.ok) {
    const gridScore = scoreGridProximity(gridResult.value, weights.gridProximity);
    if (gridScore.ok) {
      factors.push(gridScore.value);
      sourcesUsed.push('Overpass (grid)');
      dataFreshness[ScoringFactor.GridProximity] = 'OSM infrastructure data';
      checkConstraints(gridScore.value, hardConstraints, warnings);
    }
  } else {
    factors.push(createFallbackFactor(ScoringFactor.GridProximity, weights.gridProximity, 'Grid data unavailable (API timeout), using neutral score'));
    sourcesFailed.push('Overpass (grid)');
    warnings.push({ factor: ScoringFactor.GridProximity, description: 'Grid infrastructure data unavailable' });
  }

  // --- Land use ---
  if (landUseResult?.ok) {
    const luScore = scoreLandUse(landUseResult.value, weights.landUseCompatibility);
    if (luScore.ok) {
      factors.push(luScore.value.factorScore);
      hardConstraints.push(...luScore.value.hardConstraints);
      sourcesUsed.push('Overpass (land use)');
      dataFreshness[ScoringFactor.LandUseCompatibility] = 'OSM land use data';
      checkConstraints(luScore.value.factorScore, hardConstraints, warnings);
    }
  } else {
    factors.push(createFallbackFactor(ScoringFactor.LandUseCompatibility, weights.landUseCompatibility, 'Land use data unavailable, using neutral score'));
    sourcesFailed.push('Overpass (land use)');
    warnings.push({ factor: ScoringFactor.LandUseCompatibility, description: 'Land use data unavailable' });
  }

  // --- Planning feasibility ---
  {
    const geocode = geocodeResult?.ok ? geocodeResult.value : null;
    const nearbyWindFarms = windFarmResult?.ok ? windFarmResult.value : [];
    // Use land use soft constraints as density proxy
    const residentialDensityProxy = landUseResult?.ok
      ? landUseResult.value.softConstraints.filter((sc) => sc.type === 'residential').length
      : 0;

    const planScore = scorePlanning({ geocode, nearbyWindFarms, residentialDensityProxy }, weights.planningFeasibility);
    if (planScore.ok) {
      factors.push(planScore.value);
      if (geocode) sourcesUsed.push('Nominatim');
      if (nearbyWindFarms.length > 0) sourcesUsed.push('Overpass (wind farms)');
      dataFreshness[ScoringFactor.PlanningFeasibility] = 'Heuristic estimate';
      checkConstraints(planScore.value, hardConstraints, warnings);
    }
    if (!geocodeResult?.ok) sourcesFailed.push('Nominatim');
    if (!windFarmResult?.ok) sourcesFailed.push('Overpass (wind farms)');
  }

  // --- Access logistics ---
  if (roadResult?.ok) {
    const accessScore = scoreAccess(roadResult.value, weights.accessLogistics);
    if (accessScore.ok) {
      factors.push(accessScore.value);
      sourcesUsed.push('Overpass (roads)');
      dataFreshness[ScoringFactor.AccessLogistics] = 'OSM road network data';
      checkConstraints(accessScore.value, hardConstraints, warnings);
    }
  } else {
    factors.push(createFallbackFactor(ScoringFactor.AccessLogistics, weights.accessLogistics, 'Road access data unavailable, using neutral score'));
    sourcesFailed.push('Overpass (roads)');
    warnings.push({ factor: ScoringFactor.AccessLogistics, description: 'Road access data unavailable' });
  }

  // Deduplicate sourcesUsed
  const uniqueSources = [...new Set(sourcesUsed)];

  const compositeScore = computeCompositeScore(factors);
  const durationMs = Date.now() - startTime;

  return ok({
    coordinate,
    compositeScore,
    factors,
    hardConstraints,
    warnings,
    metadata: {
      analysedAt: new Date().toISOString(),
      dataFreshness,
      sourcesUsed: uniqueSources,
      sourcesFailed,
      durationMs,
      hubHeightM,
      windShearAlpha,
    },
  });
}

export function computeCompositeScore(factors: FactorScore[]): number {
  const totalWeightedScore = factors.reduce((sum, f) => sum + f.weightedScore, 0);
  return Math.round(totalWeightedScore);
}

function checkConstraints(
  factorScore: FactorScore,
  hardConstraints: Constraint[],
  warnings: Warning[],
): void {
  if (factorScore.score < HARD_CONSTRAINT_THRESHOLD) {
    hardConstraints.push({
      factor: factorScore.factor,
      description: `${factorScore.factor} scored ${factorScore.score}/100, below viability threshold`,
      severity: factorScore.score < 10 ? 'blocking' : 'severe',
    });
  } else if (factorScore.score < 40) {
    warnings.push({
      factor: factorScore.factor,
      description: `${factorScore.factor} scored ${factorScore.score}/100, which may present challenges`,
    });
  }
}

function createFallbackFactor(
  factor: ScoringFactor,
  weight: number,
  detail: string,
): FactorScore {
  return {
    factor,
    score: 50,
    weight,
    weightedScore: 50 * weight,
    detail,
    dataSource: 'N/A (data unavailable, using neutral score)',
    confidence: 'low',
  };
}
