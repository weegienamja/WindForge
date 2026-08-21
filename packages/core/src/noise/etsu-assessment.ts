// ETSU-R-97 noise assessment framework
//
// UK planning noise limits for wind turbines:
// - Quiet daytime: higher of (background + 5 dBA) or fixed lower limit (35-40 dBA)
// - Night-time: absolute limit of 43 dBA at any receptor
// - Background noise levels should be measured or conservatively assumed

import type { LatLng } from '../types/analysis.js';
import type {
  NoiseResult,
  BackgroundNoise,
  EtsuOptions,
  ReceptorAssessment,
  EtsuAssessment,
} from '../types/noise.js';

const DEFAULT_QUIET_DAYTIME_LOWER_DBA = 35;
const DEFAULT_NIGHT_LIMIT_DBA = 43;
const DEFAULT_BACKGROUND_MARGIN_DBA = 5;
const DEFAULT_BACKGROUND_DBA = 30; // Conservative rural assumption

/**
 * Determine the ETSU-R-97 daytime noise limit for a receptor.
 *
 * The limit is the higher of:
 * - Background noise + 5 dBA (or configured margin)
 * - A fixed lower limit (35-40 dBA depending on site context)
 *
 * @param backgroundDba - Measured/assumed background noise at receptor
 * @param options - ETSU configuration options
 * @returns Applicable daytime noise limit (dBA)
 */
export function daytimeNoiseLimit(backgroundDba: number, options: EtsuOptions = {}): number {
  const margin = options.backgroundMarginDba ?? DEFAULT_BACKGROUND_MARGIN_DBA;
  const lowerLimit = options.quietDaytimeLowerLimitDba ?? DEFAULT_QUIET_DAYTIME_LOWER_DBA;

  const backgroundPlusMargin = backgroundDba + margin;
  return Math.max(backgroundPlusMargin, lowerLimit);
}

/**
 * Determine the ETSU-R-97 night-time noise limit.
 */
export function nightTimeNoiseLimit(options: EtsuOptions = {}): number {
  return options.nightTimeLimitDba ?? DEFAULT_NIGHT_LIMIT_DBA;
}

/**
 * Compare simplified predictions with illustrative ETSU-R-97 screening limits.
 *
 * @param noiseResults - Predicted noise levels at each receptor
 * @param backgroundLevels - Background noise measurements per receptor
 * @param options - ETSU configuration options
 */
export function assessNoiseScreening(
  noiseResults: NoiseResult[],
  backgroundLevels: BackgroundNoise[],
  options: EtsuOptions = {},
): EtsuAssessment {
  const defaultBg = options.defaultBackgroundDba ?? DEFAULT_BACKGROUND_DBA;
  const nightLimit = nightTimeNoiseLimit(options);

  const assessments: ReceptorAssessment[] = [];

  for (const result of noiseResults) {
    // Find matching background level by proximity
    const bg = findClosestBackground(result.receptor, backgroundLevels);
    const dayBg = bg?.daytimeLevelDba ?? defaultBg;

    const dayLimit = daytimeNoiseLimit(dayBg, options);
    const dayMargin = dayLimit - result.predictedLevelDba;
    const nightMargin = nightLimit - result.predictedLevelDba;

    assessments.push({
      location: result.receptor,
      label:
        bg?.label ??
        `Receptor (${result.receptor.lat.toFixed(4)}, ${result.receptor.lng.toFixed(4)})`,
      predictedLevelDba: result.predictedLevelDba,
      daytimeLimitDba: Math.round(dayLimit * 10) / 10,
      nightTimeLimitDba: nightLimit,
      daytimeMarginDba: Math.round(dayMargin * 10) / 10,
      nightTimeMarginDba: Math.round(nightMargin * 10) / 10,
      withinDaytimeScreeningLimit: dayMargin >= 0,
      withinNightScreeningLimit: nightMargin >= 0,
    });
  }

  // Overall screening-threshold state
  const withinAllScreeningLimits = assessments.every(
    (a) => a.withinDaytimeScreeningLimit && a.withinNightScreeningLimit,
  );

  // Worst case margin (most negative = worst exceedance)
  let worstMargin = Infinity;
  let worstLabel = '';
  for (const a of assessments) {
    const worstForReceptor = Math.min(a.daytimeMarginDba, a.nightTimeMarginDba);
    if (worstForReceptor < worstMargin) {
      worstMargin = worstForReceptor;
      worstLabel = a.label;
    }
  }

  // Summary string
  const withinCount = assessments.filter(
    (a) => a.withinDaytimeScreeningLimit && a.withinNightScreeningLimit,
  ).length;

  let summary: string;
  if (assessments.length === 0) {
    summary = 'No receptors assessed.';
    worstMargin = 0;
  } else if (withinAllScreeningLimits) {
    summary = `Within the illustrative ETSU-R-97 screening limits at all ${assessments.length} receptors. Worst-case margin: ${worstMargin.toFixed(1)} dBA at ${worstLabel}.`;
  } else {
    const exceedCount = assessments.length - withinCount;
    summary = `Above the illustrative ETSU-R-97 screening limit at ${exceedCount} of ${assessments.length} receptors. Worst-case margin: ${worstMargin.toFixed(1)} dBA at ${worstLabel}.`;
  }

  return {
    receptors: assessments,
    withinAllScreeningLimits,
    assessmentLevel: 'screening',
    disclaimer:
      'Simplified broadband screening only; not an ETSU-R-97 compliance assessment or substitute for measured background noise and acoustic consultancy.',
    worstCaseMarginDba: assessments.length > 0 ? Math.round(worstMargin * 10) / 10 : 0,
    worstCaseReceptorLabel: worstLabel,
    summary,
  };
}

/** @deprecated Use assessNoiseScreening. */
export const assessNoiseCompliance = assessNoiseScreening;

/**
 * Find the closest background noise measurement to a receptor location.
 */
function findClosestBackground(
  receptor: LatLng,
  backgrounds: BackgroundNoise[],
): BackgroundNoise | undefined {
  if (backgrounds.length === 0) return undefined;

  let closest: BackgroundNoise | undefined;
  let closestDist = Infinity;

  for (const bg of backgrounds) {
    const d = approximateDistM(receptor, bg.location);
    if (d < closestDist) {
      closestDist = d;
      closest = bg;
    }
  }

  return closest;
}

/**
 * Fast approximate distance in metres (good enough for nearest-neighbour search).
 */
function approximateDistM(a: LatLng, b: LatLng): number {
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  const dx = (b.lng - a.lng) * 111320 * cosLat;
  const dy = (b.lat - a.lat) * 111320;
  return Math.sqrt(dx * dx + dy * dy);
}
