import type { ScoringWeights } from '../types/analysis.js';
import type { SiteBoundary, SamplePoint, AggregatedSiteScore, SiteAssessment, SiteAssessmentMetadata } from '../types/site.js';
import type { SiteConstraintReport } from '../types/constraints.js';
import type { TurbineModel } from '../types/turbines.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { analyseSite, normaliseWeights } from '../scoring/engine.js';
import { generateSampleGrid } from './site-boundary.js';
import { detectConstraints } from '../constraints/constraint-detector.js';
import { fetchConstraintData } from '../constraints/constraint-queries.js';
import { isPointInPolygon } from '../utils/geometry.js';
import type { FactorScore } from '../types/analysis.js';
import { ScoringFactor } from '../types/analysis.js';

export interface SiteAssessmentOptions {
  weights?: Partial<ScoringWeights>;
  hubHeightM?: number;
  gridSpacingKm?: number;
  turbineModel?: TurbineModel;
  maxConcurrentAnalyses?: number;
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Assess a site boundary - the main entry point for parcel-based analysis.
 *
 * 1. Generates sample grid within the boundary
 * 2. Fetches constraint data for the entire bounding box
 * 3. Runs analyseSite() on each sample point (batched to avoid API flooding)
 * 4. Applies constraint exclusions to each point
 * 5. Aggregates scores across valid (non-excluded) points
 * 6. Returns full SiteAssessment
 */
export async function assessSite(
  boundary: SiteBoundary,
  options: SiteAssessmentOptions = {},
): Promise<Result<SiteAssessment, ScoringError>> {
  const startTime = Date.now();
  const hubHeightM = options.hubHeightM ?? 80;
  const maxConcurrent = options.maxConcurrentAnalyses ?? 5;
  const signal = options.signal;

  const weightsResult = normaliseWeights(options.weights ?? {});
  if (!weightsResult.ok) return weightsResult;
  const weights = weightsResult.value;

  // Generate sample grid
  const gridPoints = generateSampleGrid(boundary, options.gridSpacingKm);
  if (gridPoints.length === 0) {
    return err(scoringError(ScoringErrorCode.Unknown, 'Site boundary is too small to generate sample points'));
  }

  // Fetch constraint data for the entire site (one Overpass call)
  const constraintDataResult = await fetchConstraintData(boundary, signal);
  let constraintReport: SiteConstraintReport;

  if (constraintDataResult.ok) {
    constraintReport = detectConstraints(boundary, constraintDataResult.value);
  } else {
    // Fallback if Overpass fails: empty constraint report
    constraintReport = emptyConstraintReport();
  }

  // Determine exclusion zones
  const exclusionZones = constraintReport.exclusionZones;

  // Run point analyses in batches
  const samplePoints: SamplePoint[] = [];
  const total = gridPoints.length;
  let completed = 0;

  for (let i = 0; i < gridPoints.length; i += maxConcurrent) {
    if (signal?.aborted) {
      return err(scoringError(ScoringErrorCode.Unknown, 'Assessment cancelled'));
    }

    const batch = gridPoints.slice(i, i + maxConcurrent);
    const batchResults = await Promise.allSettled(
      batch.map((coord) =>
        analyseSite({
          coordinate: coord,
          weights,
          hubHeightM,
          signal,
        }),
      ),
    );

    for (let j = 0; j < batch.length; j++) {
      const coord = batch[j]!;
      const settled = batchResults[j]!;

      // Check if this point falls in an exclusion zone
      const exclusionReasons: string[] = [];
      for (const zone of exclusionZones) {
        if (isPointInPolygon(coord, zone.polygon)) {
          exclusionReasons.push(zone.reason);
        }
      }
      const isExcluded = exclusionReasons.length > 0;

      if (settled.status === 'fulfilled' && settled.value.ok) {
        samplePoints.push({
          coordinate: coord,
          analysis: settled.value.value,
          isExcluded,
          exclusionReasons,
        });
      } else {
        // Create a minimal fallback analysis for failed points
        samplePoints.push({
          coordinate: coord,
          analysis: {
            coordinate: coord,
            compositeScore: 0,
            factors: [],
            hardConstraints: [],
            warnings: [{ factor: ScoringFactor.WindResource, description: 'Analysis failed for this point' }],
            metadata: {
              analysedAt: new Date().toISOString(),
              dataFreshness: {},
              sourcesUsed: [],
              sourcesFailed: ['all'],
              durationMs: 0,
              hubHeightM,
              windShearAlpha: 0.14,
            },
          },
          isExcluded: true,
          exclusionReasons: ['Analysis failed'],
        });
      }

      completed++;
      options.onProgress?.(completed, total);
    }
  }

  // Aggregate scores across valid (non-excluded) points
  const aggregatedScore = aggregateScores(samplePoints, boundary.areaSqKm);

  // Update constraint report with computed viable area
  constraintReport.summary.viableAreaPercent = aggregatedScore.viableAreaPercent;

  const sourcesUsed = new Set<string>();
  const sourcesFailed = new Set<string>();
  for (const sp of samplePoints) {
    for (const s of sp.analysis.metadata.sourcesUsed) sourcesUsed.add(s);
    for (const s of sp.analysis.metadata.sourcesFailed) sourcesFailed.add(s);
  }
  if (constraintDataResult.ok) sourcesUsed.add('Overpass (constraints)');
  else sourcesFailed.add('Overpass (constraints)');

  const metadata: SiteAssessmentMetadata = {
    analysedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    sampleSpacingKm: options.gridSpacingKm ?? (boundary.areaSqKm < 10 ? 0.5 : 1.0),
    hubHeightM,
    sourcesUsed: [...sourcesUsed],
    sourcesFailed: [...sourcesFailed],
  };

  const assessment: SiteAssessment = {
    boundary,
    samplePoints,
    aggregatedScore,
    constraints: constraintReport,
    metadata,
  };

  return ok(assessment);
}

function aggregateScores(samplePoints: SamplePoint[], totalAreaSqKm: number): AggregatedSiteScore {
  const validPoints = samplePoints.filter((sp) => !sp.isExcluded && sp.analysis.factors.length > 0);
  const excludedCount = samplePoints.length - validPoints.length;

  if (validPoints.length === 0) {
    // All points excluded
    const firstPoint = samplePoints[0]!;
    return {
      compositeScore: 0,
      factorAverages: [],
      viableAreaSqKm: 0,
      viableAreaPercent: 0,
      bestPoint: firstPoint,
      worstPoint: firstPoint,
      sampleCount: samplePoints.length,
      excludedCount,
    };
  }

  const compositeScores = validPoints.map((sp) => sp.analysis.compositeScore);
  const compositeScore = Math.round(compositeScores.reduce((a, b) => a + b, 0) / compositeScores.length);

  // Average each factor across valid points
  const factorMap = new Map<string, { scores: number[]; weights: number[]; details: string[]; dataSources: string[]; confidences: Array<'high' | 'medium' | 'low'> }>();
  for (const sp of validPoints) {
    for (const f of sp.analysis.factors) {
      const key = f.factor;
      if (!factorMap.has(key)) {
        factorMap.set(key, { scores: [], weights: [], details: [], dataSources: [], confidences: [] });
      }
      const entry = factorMap.get(key)!;
      entry.scores.push(f.score);
      entry.weights.push(f.weight);
      entry.details.push(f.detail);
      entry.dataSources.push(f.dataSource);
      entry.confidences.push(f.confidence);
    }
  }

  const factorAverages: FactorScore[] = [];
  for (const [factor, data] of factorMap) {
    const avgScore = Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length);
    const avgWeight = data.weights[0] ?? 0;
    // Most common confidence
    const confCounts = new Map<string, number>();
    for (const c of data.confidences) confCounts.set(c, (confCounts.get(c) ?? 0) + 1);
    let bestConf: 'high' | 'medium' | 'low' = 'low';
    let bestCount = 0;
    for (const [c, count] of confCounts) {
      if (count > bestCount) { bestConf = c as 'high' | 'medium' | 'low'; bestCount = count; }
    }

    factorAverages.push({
      factor: factor as ScoringFactor,
      score: avgScore,
      weight: avgWeight,
      weightedScore: avgScore * avgWeight,
      detail: `Site average across ${data.scores.length} sample points`,
      dataSource: data.dataSources[0] ?? '',
      confidence: bestConf,
    });
  }

  const viableAreaPercent = totalAreaSqKm > 0
    ? Math.round((validPoints.length / samplePoints.length) * 100)
    : 0;
  const viableAreaSqKm = totalAreaSqKm * (validPoints.length / samplePoints.length);

  // Find best and worst points
  let bestPoint = validPoints[0]!;
  let worstPoint = validPoints[0]!;
  for (const sp of validPoints) {
    if (sp.analysis.compositeScore > bestPoint.analysis.compositeScore) bestPoint = sp;
    if (sp.analysis.compositeScore < worstPoint.analysis.compositeScore) worstPoint = sp;
  }

  return {
    compositeScore,
    factorAverages,
    viableAreaSqKm,
    viableAreaPercent,
    bestPoint,
    worstPoint,
    sampleCount: samplePoints.length,
    excludedCount,
  };
}

function emptyConstraintReport(): SiteConstraintReport {
  return {
    hardConstraints: [],
    softConstraints: [],
    infoConstraints: [],
    exclusionZones: [],
    nearestReceptors: {
      nearestDwellingM: null,
      nearestSettlementM: null,
      nearestProtectedAreaM: null,
      nearestSubstationM: null,
      nearestMajorRoadM: null,
      nearestExistingWindFarmM: null,
      nearestWaterbodyM: null,
      nearestRailwayM: null,
    },
    summary: {
      totalHard: 0,
      totalSoft: 0,
      totalInfo: 0,
      viableAreaPercent: 100,
      topBlocker: null,
      recommendation: 'proceed_with_caution',
      reasoning: 'Constraint data unavailable. Proceed with caution and verify constraints manually.',
    },
  };
}
