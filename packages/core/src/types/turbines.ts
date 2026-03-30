import type { LatLng } from './analysis.js';

export interface PowerCurvePoint {
  windSpeedMs: number;
  powerKw: number;
}

export interface ThrustCurvePoint {
  windSpeedMs: number;
  thrustCoefficient: number;
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
