import type { LatLng } from '../types/analysis.js';
import type { ExclusionZone } from '../types/constraints.js';
import type { WindDataSummary } from '../types/datasources.js';
import { ScoringErrorCode, scoringError, type ScoringError } from '../types/errors.js';
import { err, ok, type Result } from '../types/result.js';
import type { SiteBoundary } from '../types/site.js';
import type { TurbineLayoutEstimate, TurbineModel } from '../types/turbines.js';
import {
  findCandidateLayouts,
  type CandidateLayoutSearchOptions,
  type CandidateLayoutSearchResult,
} from './candidate-layout-search.js';
import {
  integerInRange,
  isValidPosition,
  satisfiesSpacing,
  validCoordinate,
  validLayoutGeometry,
} from './layout-constraints.js';
import {
  optimiseLayout,
  type OptimisedLayoutResult,
  type OptimiserOptions,
} from './layout-optimiser.js';

export interface MultiStartOptimiserOptions extends OptimiserOptions, CandidateLayoutSearchOptions {
  /** Optional complete candidate pool, at most 128 points. Never silently truncated. */
  candidatePositions?: LatLng[];
}

export interface MultiStartOptimisedLayoutResult {
  /** Best refined layout; includes the baseline as a contender. */
  best: OptimisedLayoutResult;
  baseline: OptimisedLayoutResult;
  search: CandidateLayoutSearchResult;
  /** Includes the baseline; duplicate baseline starts are skipped. */
  startsEvaluated: number;
  improvementOverBaselinePercent: number;
  selectedStart: 'baseline' | 'candidate';
}

function layoutKey(positions: LatLng[]): string {
  return positions
    .map((p) => `${p.lat},${p.lng}`)
    .sort()
    .join('|');
}

// Bound the default pool to max(64, initial turbine count), including the baseline.
// This is a coarse geographic grid, not a capacity estimate or an optimal discretisation.
function defaultCandidates(initial: LatLng[], boundary: SiteBoundary): LatLng[] {
  const positions = initial.map((p) => ({ ...p }));
  const count = Math.max(64, initial.length) - initial.length;
  if (count === 0) return positions;
  const rows = Math.ceil(Math.sqrt(count));
  const columns = Math.ceil(count / rows);
  const south = Math.min(...boundary.polygon.map((p) => p.lat));
  const north = Math.max(...boundary.polygon.map((p) => p.lat));
  const west = Math.min(...boundary.polygon.map((p) => p.lng));
  const east = Math.max(...boundary.polygon.map((p) => p.lng));
  for (let i = 0; i < count; i++) {
    positions.push({
      lat: south + ((Math.floor(i / columns) + 0.5) / rows) * (north - south),
      lng: west + (((i % columns) + 0.5) / columns) * (east - west),
    });
  }
  return positions;
}

/**
 * Search fixed-count feasible candidate layouts, then refine each retained start
 * with the same wake model and hill-climbing options as the baseline. Counts refer
 * only to the finite candidate pool, before refinement. No global AEP guarantee.
 * Synchronous CPU work: run in a worker for interactive applications.
 */
export function optimiseLayoutWithCandidates(
  initialLayout: TurbineLayoutEstimate,
  boundary: SiteBoundary,
  turbine: TurbineModel,
  windData: WindDataSummary,
  exclusionZones: ExclusionZone[] = [],
  options: MultiStartOptimiserOptions = {},
): Result<MultiStartOptimisedLayoutResult, ScoringError> {
  const minSpacingDiameters = options.minSpacingDiameters ?? 3;
  const minSpacingM = minSpacingDiameters * turbine.rotorDiameterM;
  const maxIterations = options.maxIterations ?? 50;
  const initialStepM = options.initialStepM ?? 100;
  const minStepM = options.minStepM ?? 10;
  const roughnessClass = options.roughnessClass ?? 1;
  if (
    !integerInRange(initialLayout.turbineCount, 0, 128) ||
    initialLayout.turbineCount !== initialLayout.positions.length ||
    !initialLayout.positions.every(validCoordinate) ||
    !validLayoutGeometry(boundary, exclusionZones) ||
    !Number.isFinite(turbine.rotorDiameterM) ||
    turbine.rotorDiameterM <= 0 ||
    !Number.isFinite(minSpacingDiameters) ||
    minSpacingDiameters <= 0 ||
    !Number.isFinite(minSpacingM) ||
    !integerInRange(maxIterations, 0, 100) ||
    !Number.isFinite(initialStepM) ||
    initialStepM <= 0 ||
    !Number.isFinite(minStepM) ||
    minStepM <= 0 ||
    !Number.isFinite(roughnessClass) ||
    roughnessClass < 0 ||
    roughnessClass > 3 ||
    (options.wakeModel !== undefined && !['jensen', 'bastankhah'].includes(options.wakeModel))
  ) {
    return err(
      scoringError(
        ScoringErrorCode.Configuration,
        'Provide a consistent 0-128-turbine baseline, valid geometry, positive finite rotor/spacing/step sizes, 0-100 iterations, roughness 0-3 and a supported wake model.',
      ),
    );
  }
  if (
    initialLayout.positions.some(
      (position, index) =>
        !isValidPosition(position, boundary, exclusionZones) ||
        !satisfiesSpacing(position, initialLayout.positions, index, minSpacingM / 1000),
    )
  ) {
    return err(
      scoringError(
        ScoringErrorCode.Configuration,
        'The baseline must already satisfy site, exclusion and minimum-spacing constraints.',
      ),
    );
  }

  const search = findCandidateLayouts(
    options.candidatePositions ?? defaultCandidates(initialLayout.positions, boundary),
    boundary,
    initialLayout.turbineCount,
    minSpacingM,
    exclusionZones,
    options,
  );
  if (!search.ok) return search;

  const baseline = optimiseLayout(
    initialLayout,
    boundary,
    turbine,
    windData,
    exclusionZones,
    options,
  );
  if (!Number.isFinite(baseline.optimisedAepMwh)) {
    return err(
      scoringError(
        ScoringErrorCode.InsufficientData,
        'The baseline wake model produced a non-finite AEP.',
      ),
    );
  }
  let best = baseline;
  let selectedStart: 'baseline' | 'candidate' = 'baseline';
  let startsEvaluated = 1;
  const seen = new Set([layoutKey(initialLayout.positions)]);
  for (const positions of search.value.layouts) {
    const key = layoutKey(positions);
    if (seen.has(key)) continue;
    seen.add(key);
    const refined = optimiseLayout(
      { ...initialLayout, positions },
      boundary,
      turbine,
      windData,
      exclusionZones,
      options,
    );
    startsEvaluated++;
    if (!Number.isFinite(refined.optimisedAepMwh)) {
      return err(
        scoringError(
          ScoringErrorCode.InsufficientData,
          'The wake model produced a non-finite AEP.',
        ),
      );
    }
    if (refined.optimisedAepMwh > best.optimisedAepMwh) {
      best = refined;
      selectedStart = 'candidate';
    }
  }
  return ok({
    best,
    baseline,
    search: search.value,
    startsEvaluated,
    selectedStart,
    improvementOverBaselinePercent:
      baseline.optimisedAepMwh > 0
        ? ((best.optimisedAepMwh - baseline.optimisedAepMwh) / baseline.optimisedAepMwh) * 100
        : 0,
  });
}
