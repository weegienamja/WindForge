// ISO 9613-2 simplified noise propagation model
//
// Sound pressure level at receptor:
//   Lp = Lw - Adiv - Aatm - Agr - Abar
//
// Where:
//   Lw: source sound power level (dBA)
//   Adiv: geometric divergence = 20*log10(d) + 11.2  (d = distance in metres)
//   Aatm: atmospheric absorption (dB per metre, frequency-dependent)
//   Agr: ground effect attenuation
//   Abar: barrier (terrain screening) attenuation

import type { LatLng } from '../types/analysis.js';
import type {
  NoiseOptions,
  NoiseResult,
  TurbineNoiseContribution,
  ElevationProfile,
  GroundType,
} from '../types/noise.js';

/**
 * A-weighted atmospheric absorption coefficient at 500Hz centre frequency
 * (dB per km). ISO 9613-1, Table 4.
 * Typical conditions: 10C, 70% RH.
 */
const DEFAULT_ATMOSPHERIC_ABSORPTION_DB_PER_KM = 3.66;

/**
 * Ground effect attenuation factors by ground type (simplified ISO 9613-2 Table 7).
 * Single-frequency A-weighted approximation for wind turbine broadband noise.
 */
const GROUND_EFFECT: Record<GroundType, number> = {
  hard: 0, // Paved, water, concrete (acoustically reflective)
  mixed: 1.5, // Mixed terrain (ISO default for propagation over mixed ground)
  soft: 3.0, // Grassland, agricultural (acoustically absorptive)
};

/**
 * Calculate the slant distance from a turbine hub to a receptor point.
 * Accounts for hub height above ground level.
 *
 * @param turbineLocation - Turbine base position
 * @param receptor - Receptor position
 * @param hubHeightM - Turbine hub height (m)
 * @returns Slant distance in metres
 */
export function slantDistance(
  turbineLocation: LatLng,
  receptor: LatLng,
  hubHeightM: number,
): number {
  const horizontalM = haversineDistanceM(turbineLocation, receptor);
  // Slant distance: hypotenuse of horizontal distance and hub height
  return Math.sqrt(horizontalM ** 2 + hubHeightM ** 2);
}

/**
 * Distance between two coordinates in metres using Haversine formula.
 */
function haversineDistanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat ** 2 + Math.cos(lat1) * Math.cos(lat2) * sinDLng ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Geometric divergence attenuation (dB).
 * Adiv = 20 * log10(d) + 11.2
 *
 * This is the spherical spreading loss for a point source.
 */
export function geometricDivergence(distanceM: number): number {
  if (distanceM <= 0) return 0;
  return 20 * Math.log10(distanceM) + 11.2;
}

/**
 * Atmospheric absorption attenuation (dB).
 * Uses simplified single-frequency A-weighted coefficient for wind turbine noise.
 *
 * More accurate models would use octave band analysis per ISO 9613-1,
 * but for planning-level assessment the broadband approximation is standard practice.
 */
export function atmosphericAbsorption(
  distanceM: number,
  absorptionDbPerKm: number = DEFAULT_ATMOSPHERIC_ABSORPTION_DB_PER_KM,
): number {
  return (absorptionDbPerKm * distanceM) / 1000;
}

/**
 * Ground effect attenuation (dB) per ISO 9613-2 simplified method.
 */
export function groundEffect(groundType: GroundType = 'mixed'): number {
  return GROUND_EFFECT[groundType];
}

/**
 * Barrier attenuation from terrain screening (dB).
 *
 * Uses a simplified method: if any terrain point along the elevation profile
 * between source and receptor blocks the line of sight, compute the path
 * length difference (delta) and apply the Maekawa approximation:
 *   Abar = 10 * log10(3 + 20 * delta / lambda)
 *
 * For wind turbine broadband noise, use an effective wavelength of ~0.69m (500Hz).
 *
 * @param profile - Elevation profile between turbine and receptor
 * @param sourceHeightM - Hub height of turbine
 * @param receptorHeightM - Receptor height above ground (default: 1.5m for person)
 */
export function barrierAttenuation(
  profile: ElevationProfile | undefined,
  sourceHeightM: number,
  receptorHeightM: number = 1.5,
): number {
  if (!profile || profile.points.length < 3) return 0;

  const points = profile.points;
  const sourcePoint = points[0]!;
  const receptorPoint = points[points.length - 1]!;

  // Absolute heights of source and receptor
  const sourceAbsoluteM = sourcePoint.elevationM + sourceHeightM;
  const receptorAbsoluteM = receptorPoint.elevationM + receptorHeightM;

  const totalDistM = profile.totalDistanceM;
  if (totalDistM <= 0) return 0;

  // Find the highest terrain obstruction relative to line of sight
  let maxExcessM = 0;
  let barrierDistM = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const fraction = p.distanceM / totalDistM;

    // Line of sight height at this distance
    const losHeightM = sourceAbsoluteM + fraction * (receptorAbsoluteM - sourceAbsoluteM);

    // Terrain height
    const terrainHeightM = p.elevationM;

    const excess = terrainHeightM - losHeightM;
    if (excess > maxExcessM) {
      maxExcessM = excess;
      barrierDistM = p.distanceM;
    }
  }

  if (maxExcessM <= 0) return 0; // No obstruction

  // Path length difference (Maekawa method)
  const dSourceBarrier = Math.sqrt(
    barrierDistM ** 2 + (sourceAbsoluteM - (sourcePoint.elevationM + maxExcessM)) ** 2,
  );
  const dBarrierReceptor = Math.sqrt(
    (totalDistM - barrierDistM) ** 2 +
      (receptorAbsoluteM - (receptorPoint.elevationM + maxExcessM)) ** 2,
  );
  const d = Math.sqrt(totalDistM ** 2 + (sourceAbsoluteM - receptorAbsoluteM) ** 2);

  const delta = dSourceBarrier + dBarrierReceptor - d;

  if (delta <= 0) return 0;

  // Maekawa formula with effective wavelength for 500Hz
  const wavelengthM = 0.686; // speed of sound 343 m/s / 500 Hz
  const n = (2 * delta) / wavelengthM; // Fresnel number

  // Attenuation: capped at 25 dB per ISO 9613-2
  const abar = 10 * Math.log10(3 + 20 * n);
  return Math.min(Math.max(abar, 0), 25);
}

/**
 * Calculate noise level at a single receptor from a single turbine.
 * ISO 9613-2 simplified method.
 */
export function calculateNoiseSingleTurbine(
  turbineLocation: LatLng,
  turbineId: number,
  soundPowerLevelDba: number,
  hubHeightM: number,
  receptor: LatLng,
  options: NoiseOptions = {},
  elevationProfile?: ElevationProfile,
): TurbineNoiseContribution {
  const groundType = options.groundType ?? 'mixed';
  const includeScreening = options.includeTerrainScreening !== false;

  const distM = slantDistance(turbineLocation, receptor, hubHeightM);

  // Attenuation components
  const adiv = geometricDivergence(distM);
  const aatm = atmosphericAbsorption(distM);
  const agr = groundEffect(groundType);
  const abar = includeScreening ? barrierAttenuation(elevationProfile, hubHeightM) : 0;
  const totalAttenuation = adiv + aatm + agr + abar;

  // Predicted level at receptor
  const predictedLevelDba = soundPowerLevelDba - totalAttenuation;

  return {
    turbineId,
    turbineLocation,
    soundPowerLevelDba,
    slantDistanceM: Math.round(distM * 10) / 10,
    predictedLevelDba: Math.round(predictedLevelDba * 10) / 10,
    attenuations: {
      geometricDivergenceDb: Math.round(adiv * 100) / 100,
      atmosphericAbsorptionDb: Math.round(aatm * 100) / 100,
      groundEffectDb: agr,
      barrierAttenuationDb: Math.round(abar * 100) / 100,
      totalDb: Math.round(totalAttenuation * 100) / 100,
    },
  };
}

/**
 * Logarithmic summation of sound levels (dBA).
 * Ltotal = 10 * log10(sum(10^(Li/10)))
 */
export function logarithmicSum(levelsDba: number[]): number {
  if (levelsDba.length === 0) return -Infinity;
  if (levelsDba.length === 1) return levelsDba[0]!;

  const sum = levelsDba.reduce((acc, level) => acc + 10 ** (level / 10), 0);
  return 10 * Math.log10(sum);
}

/**
 * Calculate combined noise level at a receptor from multiple turbines.
 * Each turbine's contribution is computed individually and then summed logarithmically.
 *
 * @param turbines - Array of turbine positions with IDs
 * @param receptor - Receptor location
 * @param soundPowerLevelsDba - Sound power level per turbine (or single value for all)
 * @param hubHeightM - Hub height in metres
 * @param options - Noise calculation options
 * @param elevationProfiles - Optional elevation profiles per turbine (keyed by turbine ID)
 */
export function calculateNoiseAtReceptor(
  turbines: Array<{ id: number; location: LatLng }>,
  receptor: LatLng,
  soundPowerLevelsDba: number | number[],
  hubHeightM: number,
  options: NoiseOptions = {},
  elevationProfiles?: Map<number, ElevationProfile>,
): NoiseResult {
  const contributions: TurbineNoiseContribution[] = [];

  for (let i = 0; i < turbines.length; i++) {
    const turbine = turbines[i]!;
    const spl = Array.isArray(soundPowerLevelsDba)
      ? (soundPowerLevelsDba[i] ?? soundPowerLevelsDba[0]!)
      : soundPowerLevelsDba;

    const profile = elevationProfiles?.get(turbine.id);

    const contribution = calculateNoiseSingleTurbine(
      turbine.location,
      turbine.id,
      spl,
      hubHeightM,
      receptor,
      options,
      profile,
    );

    contributions.push(contribution);
  }

  // Logarithmic summation of all contributions
  const levels = contributions.map((c) => c.predictedLevelDba);
  const predictedLevelDba = Math.round(logarithmicSum(levels) * 10) / 10;

  return {
    receptor,
    predictedLevelDba,
    contributions,
    turbineCount: turbines.length,
    assessmentLevel: 'simplified-screening',
    method: 'broadband-ISO-9613-informed',
  };
}
