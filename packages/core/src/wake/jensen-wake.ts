// Jensen/Park wake model (N.O. Jensen, 1983)
//
// Wake velocity deficit:
//   deltaV/V0 = (1 - sqrt(1 - Ct)) / (1 + k*x/r0)^2
//
// Wake radius expansion:
//   r_wake = r0 + k*x
//
// Multiple wake superposition: Root Sum of Squares (RSS / Katic)
//   delta_total = sqrt(sum(delta_i^2))

import type { TurbinePosition, WakeDeficit } from '../types/wake.js';
import type { ThrustCurvePoint } from '../types/turbines.js';

/** Default wake decay constants by terrain type */
const WAKE_DECAY_BY_ROUGHNESS: Record<number, number> = {
  0: 0.04, // Offshore / water
  1: 0.06, // Open flat terrain
  2: 0.075, // Agricultural / mixed
  3: 0.1, // Suburban / forested
};

const DEFAULT_WAKE_DECAY = 0.075;

/**
 * Get the wake decay constant for a given roughness class.
 * Higher roughness = faster wake recovery = higher k.
 */
export function wakeDecayFromRoughness(roughnessClass: number): number {
  return WAKE_DECAY_BY_ROUGHNESS[roughnessClass] ?? DEFAULT_WAKE_DECAY;
}

/**
 * Look up thrust coefficient from a thrust curve at a given wind speed.
 * Uses linear interpolation between data points.
 */
export function interpolateThrustCoefficient(
  thrustCurve: ThrustCurvePoint[],
  windSpeedMs: number,
): number {
  if (thrustCurve.length === 0) return 0;
  if (windSpeedMs <= thrustCurve[0]!.windSpeedMs) return thrustCurve[0]!.thrustCoefficient;

  const last = thrustCurve[thrustCurve.length - 1]!;
  if (windSpeedMs >= last.windSpeedMs) return last.thrustCoefficient;

  for (let i = 0; i < thrustCurve.length - 1; i++) {
    const p0 = thrustCurve[i]!;
    const p1 = thrustCurve[i + 1]!;
    if (windSpeedMs >= p0.windSpeedMs && windSpeedMs <= p1.windSpeedMs) {
      const frac = (windSpeedMs - p0.windSpeedMs) / (p1.windSpeedMs - p0.windSpeedMs);
      return p0.thrustCoefficient + frac * (p1.thrustCoefficient - p0.thrustCoefficient);
    }
  }

  return 0;
}

/**
 * Generate a thrust curve from a power curve using actuator disc theory.
 *
 * Ct = P / (0.5 * rho * A * V^3)  (power coefficient Cp)
 * Then Ct is related to Cp via: Ct = 4a(1-a) where Cp = 4a(1-a)^2
 * Simplified: Ct ~ Cp / (1-a) where a = 0.5*(1 - sqrt(1 - Cp))
 *
 * For robustness, we cap Ct at 0.999 (Betz limit region).
 */
export function generateThrustCurveFromPower(
  powerCurve: Array<{ windSpeedMs: number; powerKw: number }>,
  rotorDiameterM: number,
  airDensity: number = 1.225,
): ThrustCurvePoint[] {
  const area = Math.PI * (rotorDiameterM / 2) ** 2;
  const thrustCurve: ThrustCurvePoint[] = [];

  for (const point of powerCurve) {
    if (point.windSpeedMs <= 0 || point.powerKw <= 0) {
      thrustCurve.push({ windSpeedMs: point.windSpeedMs, thrustCoefficient: 0 });
      continue;
    }

    const powerW = point.powerKw * 1000;
    const cp = powerW / (0.5 * airDensity * area * point.windSpeedMs ** 3);
    // Cap Cp at theoretical max (Betz ~0.593)
    const cpCapped = Math.min(cp, 0.593);

    // Derive induction factor: Cp = 4a(1-a)^2
    // Solve for a using quadratic-like approximation
    // For typical operating range, a reasonable approximation:
    // a ~ 0.5 * (1 - sqrt(1 - Cp/0.593) * sqrt(0.593))
    // But a simpler and more stable approach: Ct ~ 1.5*Cp for typical range
    // Use the more rigorous approach:
    const a = inductionFromCp(cpCapped);
    const ct = Math.min(4 * a * (1 - a), 0.999);

    thrustCurve.push({
      windSpeedMs: point.windSpeedMs,
      thrustCoefficient: Math.round(ct * 1000) / 1000,
    });
  }

  return thrustCurve;
}

/**
 * Estimate axial induction factor from power coefficient.
 * Solves Cp = 4a(1-a)^2 for a using Newton's method.
 */
function inductionFromCp(cp: number): number {
  if (cp <= 0) return 0;
  // Initial guess from linear approximation
  let a = 0.33 * (cp / 0.593);

  for (let i = 0; i < 20; i++) {
    const f = 4 * a * (1 - a) ** 2 - cp;
    const df = 4 * (1 - a) ** 2 - 8 * a * (1 - a);
    if (Math.abs(df) < 1e-10) break;
    const aNext = a - f / df;
    if (Math.abs(aNext - a) < 1e-8) break;
    a = Math.max(0, Math.min(aNext, 0.5));
  }

  return a;
}

/**
 * Compute relative position of downstream turbine in wind-aligned coordinates.
 *
 * Returns downwind distance (x, positive = downstream) and
 * crosswind offset (y, always positive) in metres.
 */
export function windAlignedDistance(
  upstream: LatLng,
  downstream: LatLng,
  windDirectionDeg: number,
): { downwindM: number; crosswindM: number } {
  // Convert to local Cartesian (metres)
  const cosLat = Math.cos((upstream.lat * Math.PI) / 180);
  const dx = (downstream.lng - upstream.lng) * 111320 * cosLat;
  const dy = (downstream.lat - upstream.lat) * 111320;

  // Wind direction: 0=North, 90=East. Wind comes FROM this direction,
  // so flow direction (where wind goes) is windDir + 180.
  const flowDirRad = ((windDirectionDeg + 180) * Math.PI) / 180;

  // Unit vector in flow direction
  const flowX = Math.sin(flowDirRad);
  const flowY = Math.cos(flowDirRad);

  // Project displacement onto flow direction
  const downwindM = dx * flowX + dy * flowY;
  const crosswindM = Math.abs(-dx * flowY + dy * flowX);

  return { downwindM, crosswindM };
}

interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Calculate Jensen wake deficit from a single upstream turbine at a downstream point.
 *
 * @param ct - Thrust coefficient of upstream turbine
 * @param rotorRadiusM - Rotor radius (m) of upstream turbine
 * @param downwindM - Downwind distance (m), must be positive
 * @param crosswindM - Crosswind offset (m), always positive
 * @param downstreamRotorRadiusM - Rotor radius of downstream turbine
 * @param k - Wake decay constant
 * @returns Velocity deficit (0-1) and overlap fraction (0-1)
 */
export function jensenSingleWake(
  ct: number,
  rotorRadiusM: number,
  downwindM: number,
  crosswindM: number,
  downstreamRotorRadiusM: number,
  k: number,
): { velocityDeficit: number; overlapFraction: number } {
  if (downwindM <= 0 || ct <= 0) {
    return { velocityDeficit: 0, overlapFraction: 0 };
  }

  // Wake radius at downwind distance
  const wakeRadiusM = rotorRadiusM + k * downwindM;

  // Check if downstream rotor overlaps with wake
  const overlap = computeCircleOverlap(crosswindM, wakeRadiusM, downstreamRotorRadiusM);

  if (overlap <= 0) {
    return { velocityDeficit: 0, overlapFraction: 0 };
  }

  // Jensen centreline deficit
  const deficit = (1 - Math.sqrt(1 - ct)) / (1 + (k * downwindM) / rotorRadiusM) ** 2;

  return {
    velocityDeficit: deficit * overlap,
    overlapFraction: overlap,
  };
}

/**
 * Compute overlap fraction between wake circle and downstream rotor circle.
 * Returns the fraction of the downstream rotor area that is inside the wake.
 *
 * @param centerDistanceM - Distance between circle centres
 * @param wakeRadiusM - Radius of the wake circle
 * @param rotorRadiusM - Radius of the downstream rotor
 */
function computeCircleOverlap(
  centerDistanceM: number,
  wakeRadiusM: number,
  rotorRadiusM: number,
): number {
  // No overlap
  if (centerDistanceM >= wakeRadiusM + rotorRadiusM) return 0;

  // Full containment
  if (centerDistanceM + rotorRadiusM <= wakeRadiusM) return 1;

  // Partial overlap: compute intersection area of two circles
  const d = centerDistanceM;
  const r1 = wakeRadiusM;
  const r2 = rotorRadiusM;

  if (d <= 0) return Math.min(1, (r1 / r2) ** 2);

  const part1 = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const part2 = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  const part3 = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));

  const intersectionArea = part1 + part2 - part3;
  const rotorArea = Math.PI * r2 * r2;

  return Math.max(0, Math.min(1, intersectionArea / rotorArea));
}

/**
 * Calculate combined wake deficit at a downstream turbine from multiple upstream turbines.
 * Uses Root Sum of Squares (RSS / Katic) superposition.
 */
export function combinedWakeDeficit(deficits: number[]): number {
  if (deficits.length === 0) return 0;
  const sumSquares = deficits.reduce((sum, d) => sum + d * d, 0);
  return Math.min(Math.sqrt(sumSquares), 0.99); // Cap at 99% deficit
}

/**
 * Compute wake effects for an array of turbines at a single wind direction.
 *
 * Returns effective wind speed at each turbine position after all wake interactions.
 */
export function computeJensenWakeField(
  turbines: TurbinePosition[],
  freeStreamSpeedMs: number,
  windDirectionDeg: number,
  thrustCurve: ThrustCurvePoint[],
  k: number,
): { effectiveSpeedMs: number[]; deficits: WakeDeficit[] } {
  const n = turbines.length;
  const effectiveSpeedMs = new Array<number>(n).fill(freeStreamSpeedMs);
  const allDeficits: WakeDeficit[] = [];

  // Sort turbines by downwind position (most upstream first)
  const indices = Array.from({ length: n }, (_, i) => i);
  const centroid = {
    lat: turbines.reduce((s, t) => s + t.location.lat, 0) / n,
    lng: turbines.reduce((s, t) => s + t.location.lng, 0) / n,
  };

  // For each pair, compute wake interaction
  // Iterate: resolve wakes iteratively (upstream turbines affect downstream)
  // Sort by downwind position relative to centroid
  indices.sort((a, b) => {
    const posA = windAlignedDistance(centroid, turbines[a]!.location, windDirectionDeg);
    const posB = windAlignedDistance(centroid, turbines[b]!.location, windDirectionDeg);
    return posA.downwindM - posB.downwindM; // Most upstream first
  });

  // Iterative wake calculation: process in upwind-to-downwind order
  for (let di = 0; di < indices.length; di++) {
    const downIdx = indices[di]!;
    const downTurbine = turbines[downIdx]!;
    const downRadius = downTurbine.rotorDiameterM / 2;

    const wakeDeficitsAtDown: number[] = [];

    for (let ui = 0; ui < di; ui++) {
      const upIdx = indices[ui]!;
      const upTurbine = turbines[upIdx]!;
      const upRadius = upTurbine.rotorDiameterM / 2;

      const { downwindM, crosswindM } = windAlignedDistance(
        upTurbine.location,
        downTurbine.location,
        windDirectionDeg,
      );

      if (downwindM <= 0) continue; // Not downstream

      // Use the effective speed at the upstream turbine to get its Ct
      const upCt = interpolateThrustCoefficient(thrustCurve, effectiveSpeedMs[upIdx]!);

      const { velocityDeficit, overlapFraction } = jensenSingleWake(
        upCt,
        upRadius,
        downwindM,
        crosswindM,
        downRadius,
        k,
      );

      if (velocityDeficit > 0) {
        wakeDeficitsAtDown.push(velocityDeficit);
        allDeficits.push({
          upstreamTurbineId: upTurbine.id,
          downstreamTurbineId: downTurbine.id,
          velocityDeficit,
          downwindDistanceM: downwindM,
          crosswindOffsetM: crosswindM,
          overlapFraction,
        });
      }
    }

    // Apply combined deficit
    const totalDeficit = combinedWakeDeficit(wakeDeficitsAtDown);
    effectiveSpeedMs[downIdx] = freeStreamSpeedMs * (1 - totalDeficit);
  }

  return { effectiveSpeedMs, deficits: allDeficits };
}
