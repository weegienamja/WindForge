import type {
  ScoringWeights,
  FactorScore,
  Constraint,
  Warning,
  SiteAnalysis,
  AnalysisOptions,
  ReconciliationMetadata,
  EvidenceStatus,
  WindResourceResult,
} from '../types/analysis.js';
import { ScoringFactor } from '../types/analysis.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { fetchWindData, fetchMonthlyWindHistory } from '../datasources/nasa-power.js';
import { fetchElevationData } from '../datasources/open-elevation.js';
import {
  fetchGridInfrastructure,
  fetchLandUse,
  fetchRoadAccess,
  fetchNearbyWindFarms,
} from '../datasources/osm-overpass.js';
import { reverseGeocode } from '../datasources/nominatim.js';
import { reconcileWindData } from '../analysis/reanalysis-reconciliation.js';
import type { ReconciledWindData } from '../types/reconciliation.js';
import { scoreWindResource } from './wind-resource.js';
import { scoreTerrainSuitability } from './terrain-suitability.js';
import { scoreGridProximity } from './grid-proximity.js';
import { scoreLandUse } from './land-use.js';
import { scorePlanning } from './planning.js';
import { scoreAccess } from './access.js';
import { isValidCoordinate } from '../utils/geo.js';

const DEFAULT_HUB_HEIGHT_M = 80;
const SCREENING_WIND_SHEAR_ALPHA = 0.14;

export const DEFAULT_WEIGHTS: ScoringWeights = {
  windResource: 0.35,
  terrainSuitability: 0.2,
  gridProximity: 0.15,
  landUseCompatibility: 0.15,
  planningFeasibility: 0.1,
  accessLogistics: 0.05,
};

export function normaliseWeights(
  partial: Partial<ScoringWeights>,
): Result<ScoringWeights, ScoringError> {
  const merged = { ...DEFAULT_WEIGHTS, ...partial };
  if (Object.values(merged).some((weight) => !Number.isFinite(weight) || weight < 0)) {
    return err(
      scoringError(ScoringErrorCode.InvalidWeights, 'Weights must be finite, non-negative numbers'),
    );
  }
  const sum =
    merged.windResource +
    merged.terrainSuitability +
    merged.gridProximity +
    merged.landUseCompatibility +
    merged.planningFeasibility +
    merged.accessLogistics;

  if (sum <= 0) {
    return err(
      scoringError(ScoringErrorCode.InvalidWeights, 'Weights must sum to a positive number'),
    );
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
  if (!Number.isFinite(hubHeightM) || hubHeightM < 10 || hubHeightM > 300) {
    return err(
      scoringError(ScoringErrorCode.OutOfRange, 'Hub height must be between 10 and 300 metres'),
    );
  }

  const weightsResult = normaliseWeights(options.weights ?? {});
  if (!weightsResult.ok) {
    return weightsResult;
  }
  const weights = weightsResult.value;

  // Fetch all data in parallel using Promise.allSettled so one failure does not block others
  const [
    windSettled,
    elevationSettled,
    gridSettled,
    landUseSettled,
    roadSettled,
    windFarmSettled,
    geocodeSettled,
  ] = await Promise.allSettled([
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
  const evidence: EvidenceStatus[] = [];

  // Land-cover roughness is not available from Open-Elevation. Use a named,
  // generic open-terrain screening assumption instead of inferring it from slope.
  const windShearAlpha = SCREENING_WIND_SHEAR_ALPHA;

  // --- Optional reanalysis bias correction ---
  // Triggered only when the caller pre-fetched ERA5 / CERRA via options.reanalysis.
  let reconciliation: ReconciledWindData | null = null;
  let reconciliationMetadata: ReconciliationMetadata | null = null;
  let era5 = options.reanalysis?.era5 ?? null;
  let cerra = options.reanalysis?.cerra ?? null;
  // Automated CDS jobs are deliberately not run in the request path: they are
  // asynchronous and can outlive a serverless request. Advanced callers may
  // still supply already-fetched, caller-reviewed reanalysis through `reanalysis`.

  if (windResult?.ok && (era5 || cerra)) {
    try {
      const nasaHistorySettled = await fetchMonthlyWindHistory(coordinate, undefined, signal);
      if (nasaHistorySettled.ok) {
        const reconciled = reconcileWindData({
          nasa: { summary: windResult.value, history: nasaHistorySettled.value },
          era5: era5 ? { summary: era5.summary, history: era5.history } : null,
          cerra: cerra ? { summary: cerra.summary, history: cerra.history } : null,
        });
        if (reconciled.ok) {
          reconciliation = reconciled.value;
          reconciliationMetadata = {
            method: reconciled.value.method,
            reference: reconciled.value.reference,
            diagnostics: reconciled.value.diagnostics,
            confidence: reconciled.value.confidence,
            detail: reconciled.value.detail,
          };
          if (reconciled.value.reference === 'cerra') sourcesUsed.push('CERRA');
          if (reconciled.value.reference === 'era5') sourcesUsed.push('ERA5');
        }
      }
    } catch {
      // Never let a reconciliation failure break the analysis.
      reconciliation = null;
    }
  }
  let windResource: WindResourceResult | null = null;

  // --- Wind resource ---
  if (windResult?.ok) {
    const summaryForScoring = reconciliation?.corrected ?? windResult.value;
    const windScore = scoreWindResource({
      windData: summaryForScoring,
      weight: weights.windResource,
      hubHeightM,
      windShearAlpha,
      reconciliation,
    });
    if (windScore.ok) {
      factors.push(windScore.value);
      sourcesUsed.push('NASA POWER');
      dataFreshness[ScoringFactor.WindResource] = 'Historical monthly data';
      checkConstraints(windScore.value, hardConstraints, warnings);
      windResource = {
        raw: windResult.value,
        resolved: summaryForScoring,
        primarySource: 'NASA POWER',
        correction:
          reconciliation && reconciliation.method !== 'none'
            ? {
                status: 'applied',
                reference: reconciliation.reference,
                detail: reconciliation.detail,
              }
            : {
                status: options.reanalysis ? 'not_applied' : 'not_configured',
                reference: null,
                detail: options.reanalysis
                  ? 'Provided reanalysis did not pass the correction diagnostics; raw NASA POWER data was retained.'
                  : 'No caller-reviewed reanalysis override was supplied; raw NASA POWER data was used.',
              },
      };
      evidence.push({
        source: 'NASA POWER',
        factor: ScoringFactor.WindResource,
        status: 'available',
        requiredForComposite: true,
        detail: 'Historical monthly wind evidence was available.',
      });
    }
  } else {
    sourcesFailed.push('NASA POWER');
    const msg =
      windResult && !windResult.ok ? windResult.error.message : 'Wind data fetch rejected';
    warnings.push({
      factor: ScoringFactor.WindResource,
      description: `Wind data fetch failed: ${msg}`,
    });
    evidence.push({
      source: 'NASA POWER',
      factor: ScoringFactor.WindResource,
      status: 'unavailable',
      requiredForComposite: true,
      detail: msg,
    });
  }

  evidence.push({
    source:
      reconciliation?.reference === 'era5'
        ? 'ERA5'
        : reconciliation?.reference === 'cerra'
          ? 'CERRA'
          : 'CDS reanalysis',
    factor: 'reanalysis',
    status:
      reconciliation && reconciliation.method !== 'none'
        ? 'available'
        : options.reanalysis
          ? 'not_applied'
          : 'not_configured',
    requiredForComposite: false,
    detail: reconciliationMetadata?.detail ?? 'Optional bias correction was not applied.',
  });

  // --- Terrain ---
  if (elevationResult?.ok) {
    const terrainScore = scoreTerrainSuitability(elevationResult.value, weights.terrainSuitability);
    if (terrainScore.ok) {
      factors.push(terrainScore.value);
      sourcesUsed.push('Open-Elevation');
      dataFreshness[ScoringFactor.TerrainSuitability] = 'SRTM elevation data';
      checkConstraints(terrainScore.value, hardConstraints, warnings);
      evidence.push({
        source: 'Open-Elevation',
        factor: ScoringFactor.TerrainSuitability,
        status: 'available',
        requiredForComposite: true,
        detail: 'Elevation and local slope samples were available.',
      });
    }
  } else {
    sourcesFailed.push('Open-Elevation');
    const msg =
      elevationResult && !elevationResult.ok
        ? elevationResult.error.message
        : 'Elevation fetch rejected';
    warnings.push({
      factor: ScoringFactor.TerrainSuitability,
      description: `Elevation data fetch failed: ${msg}`,
    });
    evidence.push({
      source: 'Open-Elevation',
      factor: ScoringFactor.TerrainSuitability,
      status: 'unavailable',
      requiredForComposite: true,
      detail: msg,
    });
  }

  // --- Grid proximity ---
  if (gridResult?.ok) {
    const gridScore = scoreGridProximity(gridResult.value, weights.gridProximity);
    if (gridScore.ok) {
      factors.push(gridScore.value);
      sourcesUsed.push('Overpass (grid)');
      dataFreshness[ScoringFactor.GridProximity] = 'OSM infrastructure data';
      checkConstraints(gridScore.value, hardConstraints, warnings);
      evidence.push({
        source: 'OpenStreetMap via Overpass',
        factor: ScoringFactor.GridProximity,
        status: 'available',
        requiredForComposite: true,
        detail: 'Grid feature geometry was available.',
      });
    }
  } else {
    sourcesFailed.push('Overpass (grid)');
    warnings.push({
      factor: ScoringFactor.GridProximity,
      description: 'Grid infrastructure data unavailable',
    });
    evidence.push({
      source: 'OpenStreetMap via Overpass',
      factor: ScoringFactor.GridProximity,
      status: 'unavailable',
      requiredForComposite: true,
      detail: 'Grid infrastructure query failed.',
    });
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
      evidence.push({
        source: 'OpenStreetMap via Overpass',
        factor: ScoringFactor.LandUseCompatibility,
        status: 'available',
        requiredForComposite: true,
        detail: 'Land-use geometry was available as non-statutory screening evidence.',
      });
    }
  } else {
    sourcesFailed.push('Overpass (land use)');
    warnings.push({
      factor: ScoringFactor.LandUseCompatibility,
      description: 'Land use data unavailable',
    });
    evidence.push({
      source: 'OpenStreetMap via Overpass',
      factor: ScoringFactor.LandUseCompatibility,
      status: 'unavailable',
      requiredForComposite: true,
      detail: 'Land-use query failed.',
    });
  }

  // --- Planning feasibility ---
  if (geocodeResult?.ok && windFarmResult?.ok && landUseResult?.ok) {
    const geocode = geocodeResult?.ok ? geocodeResult.value : null;
    const nearbyWindFarms = windFarmResult?.ok ? windFarmResult.value : [];
    // Use land use soft constraints as density proxy
    const residentialDensityProxy = landUseResult?.ok
      ? landUseResult.value.softConstraints.filter((sc) => sc.type === 'residential').length
      : 0;

    const planScore = scorePlanning(
      { geocode, nearbyWindFarms, residentialDensityProxy },
      weights.planningFeasibility,
    );
    if (planScore.ok) {
      factors.push(planScore.value);
      if (geocode) sourcesUsed.push('Nominatim');
      if (nearbyWindFarms.length > 0) sourcesUsed.push('Overpass (wind farms)');
      dataFreshness[ScoringFactor.PlanningFeasibility] = 'Heuristic estimate';
      checkConstraints(planScore.value, hardConstraints, warnings);
    }
    evidence.push({
      source: 'Nominatim and OpenStreetMap via Overpass',
      factor: ScoringFactor.PlanningFeasibility,
      status: 'available',
      requiredForComposite: true,
      detail: 'All planning heuristic inputs were available; this remains screening evidence.',
    });
  } else {
    if (!geocodeResult?.ok) sourcesFailed.push('Nominatim');
    if (!windFarmResult?.ok) sourcesFailed.push('Overpass (wind farms)');
    evidence.push({
      source: 'Nominatim and OpenStreetMap via Overpass',
      factor: ScoringFactor.PlanningFeasibility,
      status: 'unavailable',
      requiredForComposite: true,
      detail:
        'One or more planning heuristic inputs were unavailable; no planning score was substituted.',
    });
    warnings.push({
      factor: ScoringFactor.PlanningFeasibility,
      description: 'Planning evidence incomplete; planning score omitted',
    });
  }

  // --- Access logistics ---
  if (roadResult?.ok) {
    const accessScore = scoreAccess(roadResult.value, weights.accessLogistics);
    if (accessScore.ok) {
      factors.push(accessScore.value);
      sourcesUsed.push('Overpass (roads)');
      dataFreshness[ScoringFactor.AccessLogistics] = 'OSM road network data';
      checkConstraints(accessScore.value, hardConstraints, warnings);
      evidence.push({
        source: 'OpenStreetMap via Overpass',
        factor: ScoringFactor.AccessLogistics,
        status: 'available',
        requiredForComposite: true,
        detail: 'Road-network geometry was available.',
      });
    }
  } else {
    sourcesFailed.push('Overpass (roads)');
    warnings.push({
      factor: ScoringFactor.AccessLogistics,
      description: 'Road access data unavailable',
    });
    evidence.push({
      source: 'OpenStreetMap via Overpass',
      factor: ScoringFactor.AccessLogistics,
      status: 'unavailable',
      requiredForComposite: true,
      detail: 'Road-network query failed.',
    });
  }

  // Deduplicate sourcesUsed
  const uniqueSources = [...new Set(sourcesUsed)];

  const presentFactors = new Set(factors.map((factor) => factor.factor));
  const requiredFactors = Object.values(ScoringFactor);
  const missingRequiredFactors = requiredFactors.filter((factor) => !presentFactors.has(factor));
  const compositeEligible = missingRequiredFactors.length === 0;
  const completenessStatus = compositeEligible
    ? 'complete'
    : missingRequiredFactors.includes(ScoringFactor.WindResource)
      ? 'indeterminate'
      : 'materially_incomplete';
  const compositeScore = compositeEligible ? computeCompositeScore(factors) : null;
  const durationMs = Date.now() - startTime;

  return ok({
    coordinate,
    compositeScore,
    windResource,
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
      windShearBasis:
        'Generic open-terrain screening assumption; no land-cover roughness dataset was queried.',
      completeness: {
        status: completenessStatus,
        compositeEligible,
        missingRequiredFactors,
        detail: compositeEligible
          ? 'All six required screening factors were available.'
          : `Composite score suppressed because required factors were unavailable: ${missingRequiredFactors.join(', ')}.`,
      },
      evidence,
      ...(reconciliationMetadata ? { reconciliation: reconciliationMetadata } : {}),
    },
  });
}

export function computeCompositeScore(factors: FactorScore[]): number | null {
  if (
    factors.length === 0 ||
    factors.some(
      (factor) =>
        !Number.isFinite(factor.score) ||
        !Number.isFinite(factor.weight) ||
        !Number.isFinite(factor.weightedScore) ||
        factor.score < 0 ||
        factor.score > 100 ||
        factor.weight < 0,
    )
  )
    return null;
  const totalWeightedScore = factors.reduce((sum, f) => sum + f.weightedScore, 0);
  return Number.isFinite(totalWeightedScore) ? Math.round(totalWeightedScore) : null;
}

function checkConstraints(
  factorScore: FactorScore,
  _hardConstraints: Constraint[],
  warnings: Warning[],
): void {
  // A low heuristic factor score is a screening concern, not evidence of a
  // categorical exclusion. Only source-backed land-use detections populate
  // the legacy `hardConstraints` field.
  if (factorScore.score < 40) {
    warnings.push({
      factor: factorScore.factor,
      description: `${factorScore.factor} scored ${factorScore.score}/100 in the configured screen and requires further review`,
    });
  }
}
