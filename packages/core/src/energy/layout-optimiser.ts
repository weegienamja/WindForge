// Layout optimiser using greedy hill-climbing.
//
// Starts from an initial grid layout (from estimateTurbineCapacity) and
// iteratively shifts each turbine in 8 compass directions, accepting
// moves that increase total farm AEP. Step size reduces on each pass
// where no improvement is found, converging to a local optimum.

import type { LatLng } from '../types/analysis.js';
import type { SiteBoundary } from '../types/site.js';
import type { TurbineModel, TurbineLayoutEstimate } from '../types/turbines.js';
import type { ExclusionZone } from '../types/constraints.js';
import type { WindDataSummary } from '../types/datasources.js';
import type { WakeModelType } from '../types/wake.js';
import { isPointInPolygon } from '../utils/geometry.js';
import { pointInPolygonWithHoles } from '../utils/feature-geometry.js';
import { distanceKm } from '../utils/geo.js';
import {
  calculateDirectionalWakeLoss,
  layoutToTurbinePositions,
} from '../wake/wake-loss-calculator.js';

export interface OptimiserOptions {
  maxIterations?: number;
  initialStepM?: number;
  minStepM?: number;
  wakeModel?: WakeModelType;
  /** Minimum spacing between turbines as a multiple of rotor diameter. Default: 3. */
  minSpacingDiameters?: number;
  /** Roughness class for wake decay constant (0-3). Default: 1. */
  roughnessClass?: number;
}

export interface ConvergenceEntry {
  iteration: number;
  aepMwh: number;
}

export interface OptimisedLayoutResult {
  optimisedPositions: LatLng[];
  initialAepMwh: number;
  optimisedAepMwh: number;
  improvementPercent: number;
  iterations: number;
  convergenceHistory: ConvergenceEntry[];
}

const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_INITIAL_STEP_M = 100;
const DEFAULT_MIN_STEP_M = 10;
const DEFAULT_MIN_SPACING_DIAMETERS = 3;

// 8 compass directions as [dLat, dLng] unit vectors (approximate)
const DIRECTIONS: Array<[number, number]> = [
  [1, 0], // N
  [1, 1], // NE
  [0, 1], // E
  [-1, 1], // SE
  [-1, 0], // S
  [-1, -1], // SW
  [0, -1], // W
  [1, -1], // NW
];

/**
 * Convert a metre offset to approximate degree offset.
 */
function metresToDegLat(metres: number): number {
  return metres / 111_320;
}

function metresToDegLng(metres: number, latDeg: number): number {
  const cosLat = Math.cos((latDeg * Math.PI) / 180);
  if (cosLat === 0) return 0;
  return metres / (111_320 * cosLat);
}

/**
 * Check whether a candidate position satisfies the minimum spacing constraint
 * relative to all other turbine positions (excluding the turbine being moved).
 */
function satisfiesSpacing(
  candidate: LatLng,
  positions: LatLng[],
  movingIndex: number,
  minSpacingKm: number,
): boolean {
  for (let i = 0; i < positions.length; i++) {
    if (i === movingIndex) continue;
    const d = distanceKm(candidate, positions[i]!);
    if (d < minSpacingKm) return false;
  }
  return true;
}

/**
 * Check whether a point is inside the boundary and outside all exclusion zones.
 */
function isValidPosition(
  point: LatLng,
  boundary: SiteBoundary,
  exclusionZones: ExclusionZone[],
): boolean {
  if (!isPointInPolygon(point, boundary.polygon)) return false;
  for (const zone of exclusionZones) {
    if (pointInPolygonWithHoles(point, zone.polygon, zone.holes)) return false;
  }
  return true;
}

/**
 * Evaluate total farm AEP for a given set of positions using the wake model.
 */
function evaluateAep(
  positions: LatLng[],
  turbine: TurbineModel,
  windData: WindDataSummary,
  wakeModel: WakeModelType,
  roughnessClass: number,
  hubHeightM: number,
): number {
  const layout = layoutToTurbinePositions(positions, turbine, hubHeightM);
  const result = calculateDirectionalWakeLoss(layout, turbine, windData, wakeModel, {
    roughnessClass,
  });
  return result.wakeAdjustedFarmAepMwh;
}

/**
 * Optimise a wind farm layout using greedy hill-climbing.
 *
 * Algorithm:
 * 1. Start from the initial grid layout positions
 * 2. For each turbine, try shifting in 8 compass directions by the current step size
 * 3. Accept the shift that yields the highest AEP improvement
 * 4. If no turbine improves, halve the step size
 * 5. Stop when step size falls below minimum or max iterations reached
 */
export function optimiseLayout(
  initialLayout: TurbineLayoutEstimate,
  boundary: SiteBoundary,
  turbine: TurbineModel,
  windData: WindDataSummary,
  exclusionZones: ExclusionZone[] = [],
  options: OptimiserOptions = {},
): OptimisedLayoutResult {
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const initialStepM = options.initialStepM ?? DEFAULT_INITIAL_STEP_M;
  const minStepM = options.minStepM ?? DEFAULT_MIN_STEP_M;
  const wakeModel = options.wakeModel ?? 'jensen';
  const minSpacingDiameters = options.minSpacingDiameters ?? DEFAULT_MIN_SPACING_DIAMETERS;
  const roughnessClass = options.roughnessClass ?? 1;
  const hubHeightM = turbine.hubHeightOptionsM[0] ?? 80;
  const minSpacingKm = (minSpacingDiameters * turbine.rotorDiameterM) / 1000;

  // Copy initial positions
  const positions = initialLayout.positions.map((p) => ({ lat: p.lat, lng: p.lng }));

  // Evaluate initial AEP
  const initialAep = evaluateAep(
    positions,
    turbine,
    windData,
    wakeModel,
    roughnessClass,
    hubHeightM,
  );

  const convergenceHistory: ConvergenceEntry[] = [{ iteration: 0, aepMwh: initialAep }];

  let currentAep = initialAep;
  let stepM = initialStepM;
  let iteration = 0;

  while (iteration < maxIterations && stepM >= minStepM) {
    iteration++;
    let improved = false;

    for (let t = 0; t < positions.length; t++) {
      const original = positions[t]!;
      let bestCandidate: LatLng | null = null;
      let bestAep = currentAep;

      for (const [dLatUnit, dLngUnit] of DIRECTIONS) {
        const normFactor = Math.sqrt(dLatUnit * dLatUnit + dLngUnit * dLngUnit);
        const dLat = metresToDegLat(stepM * (dLatUnit / normFactor));
        const dLng = metresToDegLng(stepM * (dLngUnit / normFactor), original.lat);

        const candidate: LatLng = {
          lat: original.lat + dLat,
          lng: original.lng + dLng,
        };

        // Validate constraints
        if (!isValidPosition(candidate, boundary, exclusionZones)) continue;
        if (!satisfiesSpacing(candidate, positions, t, minSpacingKm)) continue;

        // Trial move
        positions[t] = candidate;
        const trialAep = evaluateAep(
          positions,
          turbine,
          windData,
          wakeModel,
          roughnessClass,
          hubHeightM,
        );
        positions[t] = original; // restore

        if (trialAep > bestAep) {
          bestAep = trialAep;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate) {
        positions[t] = bestCandidate;
        currentAep = bestAep;
        improved = true;
      }
    }

    convergenceHistory.push({ iteration, aepMwh: currentAep });

    if (!improved) {
      stepM /= 2;
    }
  }

  const improvementPercent = initialAep > 0 ? ((currentAep - initialAep) / initialAep) * 100 : 0;

  return {
    optimisedPositions: positions.map((p) => ({ lat: p.lat, lng: p.lng })),
    initialAepMwh: Math.round(initialAep * 100) / 100,
    optimisedAepMwh: Math.round(currentAep * 100) / 100,
    improvementPercent: Math.round(improvementPercent * 100) / 100,
    iterations: iteration,
    convergenceHistory,
  };
}
