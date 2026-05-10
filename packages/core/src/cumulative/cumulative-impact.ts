// Cumulative impact assessment.
//
// Evaluates the combined environmental impact of proposed turbines together
// with existing nearby wind installations. Computes cumulative noise levels,
// shadow flicker hours, and zone of theoretical visibility.

import type { LatLng } from '../types/analysis.js';
import type { TurbinePosition } from '../types/wake.js';
import type { NoiseResult, NoiseOptions } from '../types/noise.js';
import type { ShadowFlickerResult } from '../types/shadow.js';
import type { ViewshedResult } from '../visual/viewshed.js';
import type { ElevationGrid } from '../types/terrain.js';
import { calculateNoiseAtReceptor } from '../noise/noise-propagation.js';
import { calculateShadowFlicker } from '../shadow/shadow-flicker.js';
import { computeViewshed } from '../visual/viewshed.js';

/** Existing turbine discovered from OSM or user-supplied data */
export interface ExistingTurbine {
  id: number;
  location: LatLng;
  hubHeightM: number;
  rotorDiameterM: number;
  /** Sound power level (dBA). Use 104 default if unknown. */
  soundPowerLevelDba: number;
}

/** Cumulative impact assessment result */
export interface CumulativeImpactResult {
  /** Cumulative noise at each receptor (proposed + existing) */
  cumulativeNoise: NoiseResult[];
  /** Noise from proposed turbines only */
  proposedNoise: NoiseResult[];
  /** Cumulative shadow flicker (proposed + existing) */
  cumulativeFlicker: ShadowFlickerResult;
  /** Shadow flicker from proposed turbines only */
  proposedFlicker: ShadowFlickerResult;
  /** Cumulative ZTV if elevation grid provided */
  cumulativeVisibility: ViewshedResult | null;
  /** How many existing turbines were included */
  existingTurbineCount: number;
  /** Human-readable summary */
  summary: string;
}

const DEFAULT_SOUND_POWER_DBA = 104;
const DEFAULT_HUB_HEIGHT_M = 80;

/**
 * Assess cumulative environmental impact of proposed and existing turbines.
 *
 * Combines the proposed turbine positions with any existing nearby turbines
 * found via Overpass or supplied by the user, then computes cumulative noise,
 * shadow flicker, and visual impact at the given receptors.
 */
export function assessCumulativeImpact(
  proposedTurbines: TurbinePosition[],
  existingTurbines: ExistingTurbine[],
  receptors: LatLng[],
  options?: {
    noiseOptions?: NoiseOptions;
    year?: number;
    elevationGrid?: ElevationGrid;
    viewshedRadiusKm?: number;
  },
): CumulativeImpactResult {
  const noiseOpts = options?.noiseOptions ?? {};
  const year = options?.year ?? 2024;

  // Merge proposed + existing into a single list for cumulative calculation.
  // Use a dynamic offset based on the maximum proposed ID so we never collide,
  // even if the caller supplies very large IDs (e.g. OSM-derived numbers).
  const proposedMaxId = proposedTurbines.reduce((m, t) => (t.id > m ? t.id : m), 0);
  const idOffset = proposedMaxId + 1;
  const allTurbines: TurbinePosition[] = [
    ...proposedTurbines,
    ...existingTurbines.map((et, i) => ({
      id: idOffset + i,
      location: et.location,
      hubHeightM: et.hubHeightM,
      rotorDiameterM: et.rotorDiameterM,
    })),
  ];

  // Sound power levels for all turbines
  const proposedSpl = proposedTurbines.map(() => DEFAULT_SOUND_POWER_DBA);
  const existingSpl = existingTurbines.map((et) => et.soundPowerLevelDba);
  const allSpl = [...proposedSpl, ...existingSpl];

  const hubHeight = proposedTurbines[0]?.hubHeightM ?? DEFAULT_HUB_HEIGHT_M;

  // --- Noise ---
  const cumulativeNoise: NoiseResult[] = receptors.map((receptor) =>
    calculateNoiseAtReceptor(
      allTurbines.map((t) => ({ id: t.id, location: t.location })),
      receptor,
      allSpl,
      hubHeight,
      noiseOpts,
    ),
  );

  const proposedNoise: NoiseResult[] = receptors.map((receptor) =>
    calculateNoiseAtReceptor(
      proposedTurbines.map((t) => ({ id: t.id, location: t.location })),
      receptor,
      proposedSpl,
      hubHeight,
      noiseOpts,
    ),
  );

  // --- Shadow Flicker ---
  const cumulativeFlicker = calculateShadowFlicker(allTurbines, receptors, { year });
  const proposedFlicker = calculateShadowFlicker(proposedTurbines, receptors, { year });

  // --- Visual Impact ---
  let cumulativeVisibility: ViewshedResult | null = null;
  if (options?.elevationGrid) {
    cumulativeVisibility = computeViewshed(
      allTurbines,
      options.elevationGrid,
      options.viewshedRadiusKm ?? 30,
    );
  }

  // --- Summary ---
  const worstCumulativeNoise = cumulativeNoise.length > 0
    ? Math.max(...cumulativeNoise.map((n) => n.predictedLevelDba))
    : 0;
  const worstProposedNoise = proposedNoise.length > 0
    ? Math.max(...proposedNoise.map((n) => n.predictedLevelDba))
    : 0;
  const noiseIncrease = worstCumulativeNoise - worstProposedNoise;

  const summaryParts: string[] = [
    `Cumulative assessment including ${existingTurbines.length} existing turbine(s) and ${proposedTurbines.length} proposed turbine(s).`,
  ];

  if (cumulativeNoise.length > 0) {
    summaryParts.push(
      `Worst-case cumulative noise: ${worstCumulativeNoise.toFixed(1)} dBA (proposed alone: ${worstProposedNoise.toFixed(1)} dBA, increase: ${noiseIncrease.toFixed(1)} dB).`,
    );
  }

  summaryParts.push(
    `Worst-case cumulative shadow flicker: ${cumulativeFlicker.worstCaseHoursPerYear.toFixed(1)} hr/yr (proposed alone: ${proposedFlicker.worstCaseHoursPerYear.toFixed(1)} hr/yr).`,
  );

  if (cumulativeVisibility) {
    summaryParts.push(
      `Zone of Theoretical Visibility: ${cumulativeVisibility.visiblePercent.toFixed(1)}% of assessed area.`,
    );
  }

  return {
    cumulativeNoise,
    proposedNoise,
    cumulativeFlicker,
    proposedFlicker,
    cumulativeVisibility,
    existingTurbineCount: existingTurbines.length,
    summary: summaryParts.join(' '),
  };
}
