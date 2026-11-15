import type { LatLng } from './analysis.js';

export interface PowerCurvePoint {
  windSpeedMs: number;
  powerKw: number;
}

export interface ThrustCurvePoint {
  windSpeedMs: number;
  thrustCoefficient: number;
}

export interface OctaveBandSpl {
  frequencyHz: number;
  levelDba: number;
}

export interface TurbineModel {
  id: string;
  manufacturer: string;
  model: string;
  ratedPowerKw: number;
  rotorDiameterM: number;
  hubHeightOptionsM: number[];
  cutInSpeedMs: number;
  ratedSpeedMs: number;
  cutOutSpeedMs: number;
  powerCurve: PowerCurvePoint[];
  thrustCurve?: ThrustCurvePoint[];
  /** Overall A-weighted sound power level at rated wind speed (dBA) */
  soundPowerLevelDba?: number;
  /** Frequency-dependent sound power levels (octave bands) */
  octaveBandSpl?: OctaveBandSpl[];
}

export interface TurbineLayoutEstimate {
  positions: LatLng[];
  turbineCount: number;
  spacingCrosswindM: number;
  spacingDownwindM: number;
  prevailingWindDeg: number;
  viableAreaSqKm: number;
  estimatedInstalledCapacityMw: number;
}

/** Inputs actually used by energy and layout models; a rated wind speed is not required. */
export type EnergyTurbine = Omit<TurbineModel, 'cutInSpeedMs' | 'cutOutSpeedMs' | 'ratedSpeedMs'>;
