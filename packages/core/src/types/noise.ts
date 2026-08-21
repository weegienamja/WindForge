import type { LatLng } from './analysis.js';

/** Ground type for ground effect attenuation calculation */
export type GroundType = 'hard' | 'mixed' | 'soft';

/** Noise calculation options */
export interface NoiseOptions {
  /** Ground type between source and receptor (default: 'mixed') */
  groundType?: GroundType;
  /** Temperature in Celsius for atmospheric absorption (default: 10) */
  temperatureC?: number;
  /** Relative humidity percentage (default: 70) */
  relativeHumidityPct?: number;
  /** Whether to include terrain screening (barrier attenuation) (default: true) */
  includeTerrainScreening?: boolean;
  /** Hub height override in metres (uses turbine library default if not specified) */
  hubHeightM?: number;
}

/** Breakdown of attenuation components (all in dB, positive values = attenuation) */
export interface AttenuationBreakdown {
  /** Geometric divergence: 20*log10(d) + 11.2 */
  geometricDivergenceDb: number;
  /** Atmospheric absorption */
  atmosphericAbsorptionDb: number;
  /** Ground effect */
  groundEffectDb: number;
  /** Barrier/terrain screening */
  barrierAttenuationDb: number;
  /** Total attenuation */
  totalDb: number;
}

/** Noise contribution from a single turbine at a receptor */
export interface TurbineNoiseContribution {
  turbineId: number;
  turbineLocation: LatLng;
  /** Sound power level of source (dBA) */
  soundPowerLevelDba: number;
  /** Distance from turbine hub to receptor (m) */
  slantDistanceM: number;
  /** Predicted sound pressure level at receptor from this turbine (dBA) */
  predictedLevelDba: number;
  /** Attenuation breakdown */
  attenuations: AttenuationBreakdown;
}

/** Noise prediction result at a single receptor point */
export interface NoiseResult {
  /** Receptor location */
  receptor: LatLng;
  /** Combined predicted noise level from all turbines (dBA) */
  predictedLevelDba: number;
  /** Per-turbine contributions */
  contributions: TurbineNoiseContribution[];
  /** Number of turbines included */
  turbineCount: number;
  assessmentLevel: 'simplified-screening';
  method: 'broadband-ISO-9613-informed';
}

/** Elevation profile point along a line */
export interface ElevationProfilePoint {
  distanceM: number;
  elevationM: number;
  coord: LatLng;
}

/** Elevation profile between two points */
export interface ElevationProfile {
  points: ElevationProfilePoint[];
  fromCoord: LatLng;
  toCoord: LatLng;
  totalDistanceM: number;
}

/** Background noise level at a receptor (for ETSU-R-97 assessment) */
export interface BackgroundNoise {
  location: LatLng;
  /** Label for the receptor (e.g., "Property A") */
  label: string;
  /** Measured or assumed background noise level (dBA) */
  daytimeLevelDba: number;
  /** Night-time background noise level (dBA) */
  nightTimeLevelDba: number;
}

/** ETSU-R-97-informed screening threshold options. */
export interface EtsuOptions {
  /** Lower fixed limit for quiet daytime (dBA) (default: 35) */
  quietDaytimeLowerLimitDba?: number;
  /** Upper fixed limit for quiet daytime (dBA) (default: 40) */
  quietDaytimeUpperLimitDba?: number;
  /** Night-time absolute limit (dBA) (default: 43) */
  nightTimeLimitDba?: number;
  /** Margin above background for daytime limit (dBA) (default: 5) */
  backgroundMarginDba?: number;
  /** Default background noise if not provided per receptor (dBA) (default: 30 for rural) */
  defaultBackgroundDba?: number;
}

/** Assessment result for a single receptor */
export interface ReceptorAssessment {
  location: LatLng;
  label: string;
  predictedLevelDba: number;
  /** Daytime noise limit applicable (dBA) */
  daytimeLimitDba: number;
  /** Night-time noise limit applicable (dBA) */
  nightTimeLimitDba: number;
  /** Margin below daytime screening limit (positive = within, negative = exceedance). */
  daytimeMarginDba: number;
  /** Margin below night-time limit */
  nightTimeMarginDba: number;
  withinDaytimeScreeningLimit: boolean;
  withinNightScreeningLimit: boolean;
}

/** Overall ETSU-R-97-informed screening result. */
export interface EtsuAssessment {
  receptors: ReceptorAssessment[];
  withinAllScreeningLimits: boolean;
  assessmentLevel: 'screening';
  disclaimer: string;
  worstCaseMarginDba: number;
  worstCaseReceptorLabel: string;
  summary: string;
}

/** A single cell in a noise contour grid */
export interface NoiseContourCell {
  lat: number;
  lng: number;
  levelDba: number;
}

/** Grid of noise predictions for contour mapping */
export interface NoiseContourGrid {
  cells: NoiseContourCell[];
  gridSpacingM: number;
  minLevelDba: number;
  maxLevelDba: number;
  /** Standard contour thresholds crossed */
  contourLevelsDba: number[];
}
