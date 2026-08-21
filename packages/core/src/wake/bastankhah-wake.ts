// Bastankhah Gaussian wake model (Bastankhah & Porte-Agel, 2014)
//
// Gaussian wake velocity deficit profile:
//   deltaV/V0 = (1 - sqrt(1 - Ct/(8*(sigma_y/d)^2))) * exp(-r^2/(2*sigma_y^2))
//
// Where sigma_y grows linearly with downstream distance:
//   sigma_y = k* * x + epsilon * d
//   epsilon = 0.25 * sqrt(beta)
//   beta = 0.5 * (1 + sqrt(1 - Ct)) / sqrt(1 - Ct)
//   k* = wake expansion rate (similar role to Jensen k, but typically ~0.022-0.05)

import type { TurbinePosition, WakeDeficit } from '../types/wake.js';
import type { ThrustCurvePoint } from '../types/turbines.js';
import {
  windAlignedDistance,
  interpolateThrustCoefficient,
  combinedWakeDeficit,
} from './jensen-wake.js';

/** Default Bastankhah expansion rate by roughness class */
const EXPANSION_RATE_BY_ROUGHNESS: Record<number, number> = {
  0: 0.022, // Offshore
  1: 0.03, // Open terrain
  2: 0.04, // Agricultural
  3: 0.05, // Suburban / forest
};

const DEFAULT_EXPANSION_RATE = 0.04;

/**
 * Get Bastankhah wake expansion rate for a given roughness class.
 */
export function bastankhahExpansionFromRoughness(roughnessClass: number): number {
  return EXPANSION_RATE_BY_ROUGHNESS[roughnessClass] ?? DEFAULT_EXPANSION_RATE;
}

/**
 * Calculate Bastankhah Gaussian wake deficit at a specific point downstream.
 *
 * @param ct - Thrust coefficient
 * @param rotorDiameterM - Rotor diameter (m)
 * @param downwindM - Downwind distance (m), must be positive
 * @param crosswindM - Crosswind offset (m), always positive
 * @param kStar - Wake expansion rate
 * @returns Velocity deficit (0-1)
 */
export function bastankhahSingleWake(
  ct: number,
  rotorDiameterM: number,
  downwindM: number,
  crosswindM: number,
  kStar: number,
): { velocityDeficit: number } {
  if (downwindM <= 0 || ct <= 0) {
    return { velocityDeficit: 0 };
  }

  const d = rotorDiameterM;

  // Near-wake correction: beta and epsilon
  const sqrtTerm = Math.sqrt(1 - ct);
  if (sqrtTerm <= 0) {
    return { velocityDeficit: 0 };
  }
  const beta = (0.5 * (1 + sqrtTerm)) / sqrtTerm;
  const epsilon = 0.25 * Math.sqrt(beta);

  // Wake width (sigma) at downwind distance
  const sigmaY = kStar * downwindM + epsilon * d;

  // Check if sigma is too small (very near wake - model breaks down)
  const sigmaOverD = sigmaY / d;
  if (sigmaOverD < epsilon * 0.5) {
    return { velocityDeficit: 0 };
  }

  // Centreline deficit
  const ctTerm = ct / (8 * sigmaOverD * sigmaOverD);
  if (ctTerm >= 1) {
    // This shouldn't happen physically; model breaks down in extreme near-wake
    return { velocityDeficit: 0 };
  }

  const centreDef = 1 - Math.sqrt(1 - ctTerm);

  // Gaussian radial decay
  const radialDecay = Math.exp(-(crosswindM ** 2) / (2 * sigmaY ** 2));

  const deficit = centreDef * radialDecay;

  return {
    velocityDeficit: Math.max(0, Math.min(deficit, 0.99)),
  };
}

/**
 * Compute Bastankhah Gaussian wake effects for an array of turbines at a single wind direction.
 *
 * Returns effective wind speed at each turbine position after all wake interactions.
 */
export function computeBastankhahWakeField(
  turbines: TurbinePosition[],
  freeStreamSpeedMs: number,
  windDirectionDeg: number,
  thrustCurve: ThrustCurvePoint[],
  kStar: number,
): { effectiveSpeedMs: number[]; deficits: WakeDeficit[] } {
  const n = turbines.length;
  const effectiveSpeedMs = new Array<number>(n).fill(freeStreamSpeedMs);
  const allDeficits: WakeDeficit[] = [];

  // Sort by downwind position (most upstream first)
  const indices = Array.from({ length: n }, (_, i) => i);
  const centroid = {
    lat: turbines.reduce((s, t) => s + t.location.lat, 0) / n,
    lng: turbines.reduce((s, t) => s + t.location.lng, 0) / n,
  };

  indices.sort((a, b) => {
    const posA = windAlignedDistance(centroid, turbines[a]!.location, windDirectionDeg);
    const posB = windAlignedDistance(centroid, turbines[b]!.location, windDirectionDeg);
    return posA.downwindM - posB.downwindM;
  });

  for (let di = 0; di < indices.length; di++) {
    const downIdx = indices[di]!;
    const downTurbine = turbines[downIdx]!;

    const wakeDeficitsAtDown: number[] = [];

    for (let ui = 0; ui < di; ui++) {
      const upIdx = indices[ui]!;
      const upTurbine = turbines[upIdx]!;

      const { downwindM, crosswindM } = windAlignedDistance(
        upTurbine.location,
        downTurbine.location,
        windDirectionDeg,
      );

      if (downwindM <= 0) continue;

      const upCt = interpolateThrustCoefficient(thrustCurve, effectiveSpeedMs[upIdx]!);

      const { velocityDeficit } = bastankhahSingleWake(
        upCt,
        upTurbine.rotorDiameterM,
        downwindM,
        crosswindM,
        kStar,
      );

      if (velocityDeficit > 0) {
        wakeDeficitsAtDown.push(velocityDeficit);
        allDeficits.push({
          upstreamTurbineId: upTurbine.id,
          downstreamTurbineId: downTurbine.id,
          velocityDeficit,
          downwindDistanceM: downwindM,
          crosswindOffsetM: crosswindM,
          overlapFraction: 1, // Gaussian model uses continuous profile, not discrete overlap
        });
      }
    }

    const totalDeficit = combinedWakeDeficit(wakeDeficitsAtDown);
    effectiveSpeedMs[downIdx] = freeStreamSpeedMs * (1 - totalDeficit);
  }

  return { effectiveSpeedMs, deficits: allDeficits };
}
