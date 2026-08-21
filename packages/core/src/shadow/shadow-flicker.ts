import type { LatLng } from '../types/analysis.js';
import type { TurbinePosition } from '../types/wake.js';
import type {
  ShadowFlickerResult,
  ReceptorFlicker,
  ShadowThresholdOptions,
  ShadowThresholdAssessment,
} from '../types/shadow.js';
import { calculateSolarPosition } from './solar-position.js';
import { distanceKm } from '../utils/geo.js';

const DEG_TO_RAD = Math.PI / 180;

/**
 * Calculate shadow flicker at receptors from a set of turbines.
 * Performs an 8,760-hour (1-year) simulation checking whether each receptor
 * falls within the shadow path of any turbine rotor for each hour.
 *
 * @param turbines - Turbine positions with hub height and rotor diameter
 * @param receptors - Receptor locations (e.g. dwellings)
 * @param options - Optional: year to simulate (default: 2024), receptor height (default: 2m)
 * @returns Shadow flicker analysis result
 */
export function calculateShadowFlicker(
  turbines: TurbinePosition[],
  receptors: LatLng[],
  options?: { year?: number; receptorHeightM?: number },
): ShadowFlickerResult {
  const year = options?.year ?? 2024;
  const receptorHeightM = options?.receptorHeightM ?? 2;

  const receptorResults: ReceptorFlicker[] = receptors.map((receptor) => {
    // Track flicker occurrences: month -> day-of-month -> Set<hour>
    const flickerMap = new Map<number, Map<number, Set<number>>>();
    for (let month = 1; month <= 12; month++) {
      flickerMap.set(month, new Map());
    }

    let totalFlickerHours = 0;

    // Simulate each hour of the year
    const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
    const current = new Date(startDate);

    while (current < endDate) {
      const sunPos = calculateSolarPosition(current, receptor);

      // Only check when sun is above a minimum elevation (flicker doesn't happen at very low sun)
      if (sunPos.isAboveHorizon && sunPos.elevationDeg > 1) {
        let flickerThisHour = false;

        for (const turbine of turbines) {
          if (
            isFlickerOccurring(
              turbine,
              receptor,
              sunPos.azimuthDeg,
              sunPos.elevationDeg,
              receptorHeightM,
            )
          ) {
            flickerThisHour = true;
            break;
          }
        }

        if (flickerThisHour) {
          totalFlickerHours++;
          const month = current.getUTCMonth() + 1;
          const day = current.getUTCDate();
          const hour = current.getUTCHours();
          const dayMap = flickerMap.get(month)!;
          if (!dayMap.has(day)) {
            dayMap.set(day, new Set());
          }
          dayMap.get(day)!.add(hour);
        }
      }

      // Advance by 1 hour
      current.setTime(current.getTime() + 3600000);
    }

    // Calculate max minutes per day for each month
    const minutesPerDay: Array<{ month: number; maxMinutes: number }> = [];
    for (let month = 1; month <= 12; month++) {
      const dayMap = flickerMap.get(month)!;
      let maxHoursInDay = 0;
      for (const hours of dayMap.values()) {
        if (hours.size > maxHoursInDay) {
          maxHoursInDay = hours.size;
        }
      }
      // Each hour slot counts as up to 60 minutes of potential flicker
      // but actual flicker within an hour is typically a fraction
      // Convention: report as hours * 60 (astronomical worst case)
      minutesPerDay.push({ month, maxMinutes: maxHoursInDay * 60 });
    }

    return {
      location: receptor,
      hoursPerYear: totalFlickerHours,
      minutesPerDay,
    };
  });

  const worstCaseHoursPerYear = receptorResults.reduce(
    (max, r) => Math.max(max, r.hoursPerYear),
    0,
  );

  const totalReceptors = receptorResults.length;
  const affectedReceptors = receptorResults.filter((r) => r.hoursPerYear > 0).length;

  const summary =
    affectedReceptors === 0
      ? `No shadow flicker predicted at any of the ${totalReceptors} receptor(s).`
      : `Shadow flicker predicted at ${affectedReceptors} of ${totalReceptors} receptor(s). ` +
        `Worst case: ${worstCaseHoursPerYear} hours/year (astronomical maximum).`;

  return {
    receptors: receptorResults,
    worstCaseHoursPerYear,
    summary,
  };
}

/**
 * Compare shadow-flicker estimates with configurable screening thresholds.
 * Applies a sunshine fraction to the astronomical worst case. This is not a
 * planning or amenity compliance assessment.
 */
export function assessShadowThresholds(
  result: ShadowFlickerResult,
  options?: ShadowThresholdOptions,
): ShadowThresholdAssessment {
  const maxHoursPerYear = options?.maxHoursPerYear ?? 30;
  const maxMinutesPerDay = options?.maxMinutesPerDay ?? 30;
  const sunshineFraction = options?.sunshineFraction ?? 0.32;

  const receptors = result.receptors.map((r) => {
    const expectedHours = r.hoursPerYear * sunshineFraction;
    const worstDayMinutes = r.minutesPerDay.reduce((max, m) => Math.max(max, m.maxMinutes), 0);
    const expectedMinutesPerDay = worstDayMinutes * sunshineFraction;

    const withinAnnualThreshold = expectedHours <= maxHoursPerYear;
    const withinDailyThreshold = expectedMinutesPerDay <= maxMinutesPerDay;

    return {
      location: r.location,
      astronomicalHoursPerYear: r.hoursPerYear,
      expectedHoursPerYear: Math.round(expectedHours * 10) / 10,
      maxMinutesPerDay: Math.round(expectedMinutesPerDay * 10) / 10,
      withinAnnualThreshold,
      withinDailyThreshold,
      withinAllThresholds: withinAnnualThreshold && withinDailyThreshold,
    };
  });

  const overallWithinThresholds = receptors.every((r) => r.withinAllThresholds);
  const worstCaseExpectedHoursPerYear = receptors.reduce(
    (max, r) => Math.max(max, r.expectedHoursPerYear),
    0,
  );
  const worstCaseMinutesPerDay = receptors.reduce((max, r) => Math.max(max, r.maxMinutesPerDay), 0);

  const exceedanceCount = receptors.filter((r) => !r.withinAllThresholds).length;
  const summary = overallWithinThresholds
    ? `All ${receptors.length} receptor(s) were within the configured screening thresholds. ` +
      `Worst case: ${worstCaseExpectedHoursPerYear} expected hours/year ` +
      `(limit: ${maxHoursPerYear}), using ${(sunshineFraction * 100).toFixed(0)}% sunshine fraction.`
    : `${exceedanceCount} of ${receptors.length} receptor(s) exceed the configured screening thresholds. ` +
      `Worst case: ${worstCaseExpectedHoursPerYear} expected hours/year ` +
      `(limit: ${maxHoursPerYear}), ${worstCaseMinutesPerDay} minutes/day ` +
      `(limit: ${maxMinutesPerDay}).`;

  return {
    receptors,
    overallWithinThresholds,
    worstCaseExpectedHoursPerYear,
    worstCaseMinutesPerDay,
    assessmentLevel: 'screening',
    disclaimer:
      'Astronomical hourly-step screening with an assumed sunshine fraction; not a planning compliance assessment or substitute for receptor-specific study.',
    summary,
  };
}

/** @deprecated Use {@link assessShadowThresholds}. */
export const assessShadowCompliance = assessShadowThresholds;

/**
 * Determine if shadow flicker is occurring at a receptor from a specific turbine
 * at a given sun position.
 *
 * The check is:
 * 1. Is the sun behind the turbine from the receptor's perspective?
 * 2. Is the receptor within the shadow cast distance (max ~10x rotor diameter)?
 * 3. Is the receptor within the angular width of the rotor shadow?
 */
export function isFlickerOccurring(
  turbine: TurbinePosition,
  receptor: LatLng,
  sunAzimuthDeg: number,
  sunElevationDeg: number,
  receptorHeightM: number,
): boolean {
  // Distance from receptor to turbine (m)
  const distM = distanceKm(receptor, turbine.location) * 1000;

  // Skip if too far away (shadow can't reach beyond ~10x rotor diameter at reasonable sun angles)
  const maxShadowDistanceM = turbine.rotorDiameterM * 10;
  if (distM > maxShadowDistanceM || distM < 1) {
    return false;
  }

  // The sun must be behind the turbine from the receptor's perspective.
  // "Behind" means the sun azimuth is approximately the same as the bearing to the turbine.

  // Shadow is cast from the turbine in the direction opposite to the sun.
  // So the receptor needs to be on the opposite side of the turbine from the sun.
  // Bearing from turbine to receptor:
  const bearingTurbineToReceptor = bearing(turbine.location, receptor);
  // Shadow direction (opposite of sun azimuth):
  const shadowDirection = (sunAzimuthDeg + 180) % 360;
  // Receptor must be approximately in the shadow direction from the turbine
  const shadowAngleDiff = angleDifference(shadowDirection, bearingTurbineToReceptor);

  // Shadow length on ground from the turbine base
  const hubHeightAboveReceptor = turbine.hubHeightM - receptorHeightM;
  if (hubHeightAboveReceptor <= 0) return false;

  const sunElevationRad = sunElevationDeg * DEG_TO_RAD;
  if (sunElevationRad <= 0) return false;

  const shadowLengthM = hubHeightAboveReceptor / Math.tan(sunElevationRad);

  // Receptor must be within the shadow length
  if (distM > shadowLengthM) {
    return false;
  }

  // Angular width of the rotor as seen from the receptor
  // The rotor is a circle of diameter rotorDiameterM at distance distM
  const rotorAngularWidth = Math.atan2(turbine.rotorDiameterM / 2, distM) * (180 / Math.PI);

  // Receptor is in flicker zone if it's within the shadow direction and angular width
  return Math.abs(shadowAngleDiff) <= rotorAngularWidth + 1; // +1 degree margin
}

/**
 * Calculate bearing from point A to point B in degrees (0=N, clockwise).
 */
export function bearing(from: LatLng, to: LatLng): number {
  const lat1 = from.lat * DEG_TO_RAD;
  const lat2 = to.lat * DEG_TO_RAD;
  const dLng = (to.lng - from.lng) * DEG_TO_RAD;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  let brng = Math.atan2(y, x) * (180 / Math.PI);
  return ((brng % 360) + 360) % 360;
}

/**
 * Calculate the smallest angle difference between two bearings (-180 to 180).
 */
export function angleDifference(a: number, b: number): number {
  let diff = a - b;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}
