import type { LatLng } from '../types/analysis.js';
import type { SolarPosition } from '../types/shadow.js';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Calculate solar position (azimuth and elevation) at a given date/time and location.
 * Uses the simplified Meeus algorithm (Jean Meeus, "Astronomical Algorithms").
 *
 * @param date - UTC date/time
 * @param coord - Geographic coordinate
 * @returns Solar position with azimuth (0=N, clockwise) and elevation above horizon
 */
export function calculateSolarPosition(date: Date, coord: LatLng): SolarPosition {
  const jd = dateToJulianDay(date);
  const jc = (jd - 2451545.0) / 36525.0;

  // Geometric mean longitude of the sun (degrees)
  const l0 = normaliseAngle(280.46646 + jc * (36000.76983 + 0.0003032 * jc));

  // Mean anomaly of the sun (degrees)
  const m = normaliseAngle(357.52911 + jc * (35999.05029 - 0.0001537 * jc));
  const mRad = m * DEG_TO_RAD;

  // Equation of center (degrees)
  const c =
    Math.sin(mRad) * (1.9146 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * mRad) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * mRad) * 0.00029;

  // Sun's true longitude (degrees)
  const sunTrueLong = l0 + c;

  // Sun's apparent longitude (degrees) - correcting for nutation and aberration
  const omega = 125.04 - 1934.136 * jc;
  const lambda = sunTrueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG_TO_RAD);
  const lambdaRad = lambda * DEG_TO_RAD;

  // Mean obliquity of the ecliptic (degrees)
  const epsilon0 =
    23.0 + (26.0 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60.0) / 60.0;

  // Corrected obliquity (degrees)
  const epsilon = epsilon0 + 0.00256 * Math.cos(omega * DEG_TO_RAD);
  const epsilonRad = epsilon * DEG_TO_RAD;

  // Sun's right ascension (radians)
  const ra = Math.atan2(Math.cos(epsilonRad) * Math.sin(lambdaRad), Math.cos(lambdaRad));

  // Sun's declination (radians)
  const declination = Math.asin(Math.sin(epsilonRad) * Math.sin(lambdaRad));

  // Sidereal time at Greenwich (degrees)
  const gmst =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * jc * jc -
    (jc * jc * jc) / 38710000.0;

  // Local hour angle (radians)
  const localHourAngle = (normaliseAngle(gmst) + coord.lng) * DEG_TO_RAD - ra;

  const latRad = coord.lat * DEG_TO_RAD;

  // Solar elevation angle (radians)
  const sinElevation =
    Math.sin(latRad) * Math.sin(declination) +
    Math.cos(latRad) * Math.cos(declination) * Math.cos(localHourAngle);
  const elevation = Math.asin(clamp(sinElevation, -1, 1));

  // Solar azimuth using NOAA convention
  // cosA = [sin(lat)*sin(elevation) - sin(declination)] / [cos(lat)*cos(elevation)]
  const cosAzimuth =
    (Math.sin(latRad) * Math.sin(elevation) - Math.sin(declination)) /
    (Math.cos(latRad) * Math.cos(elevation));

  let azimuthFromNorth: number;
  if (Math.abs(Math.cos(elevation)) < 1e-10) {
    azimuthFromNorth = 0;
  } else {
    const acosDeg = Math.acos(clamp(cosAzimuth, -1, 1)) * RAD_TO_DEG;
    if (Math.sin(localHourAngle) > 0) {
      // Afternoon: sun west of south
      azimuthFromNorth = (acosDeg + 180) % 360;
    } else {
      // Morning: sun east of south
      azimuthFromNorth = (540 - acosDeg) % 360;
    }
  }
  azimuthFromNorth = normaliseAngle(azimuthFromNorth);
  const elevationDeg = elevation * RAD_TO_DEG;

  return {
    azimuthDeg: azimuthFromNorth,
    elevationDeg,
    isAboveHorizon: elevationDeg > 0,
  };
}

/**
 * Calculate the solar declination angle in degrees for a given date.
 * Useful for quick checks without full position calculation.
 */
export function solarDeclination(date: Date): number {
  const jd = dateToJulianDay(date);
  const jc = (jd - 2451545.0) / 36525.0;
  const l0 = normaliseAngle(280.46646 + jc * (36000.76983 + 0.0003032 * jc));
  const m = normaliseAngle(357.52911 + jc * (35999.05029 - 0.0001537 * jc));
  const mRad = m * DEG_TO_RAD;
  const c =
    Math.sin(mRad) * (1.9146 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * mRad) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * mRad) * 0.00029;
  const sunTrueLong = l0 + c;
  const omega = 125.04 - 1934.136 * jc;
  const lambda = sunTrueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG_TO_RAD);
  const epsilon0 =
    23.0 + (26.0 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60.0) / 60.0;
  const epsilon = epsilon0 + 0.00256 * Math.cos(omega * DEG_TO_RAD);
  return Math.asin(Math.sin(epsilon * DEG_TO_RAD) * Math.sin(lambda * DEG_TO_RAD)) * RAD_TO_DEG;
}

/**
 * Convert a JS Date to Julian Day number.
 */
export function dateToJulianDay(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const h =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3600000;

  let yr = y;
  let mo = m;
  if (mo <= 2) {
    yr -= 1;
    mo += 12;
  }

  const a = Math.floor(yr / 100);
  const b = 2 - a + Math.floor(a / 4);

  return (
    Math.floor(365.25 * (yr + 4716)) + Math.floor(30.6001 * (mo + 1)) + d + h / 24.0 + b - 1524.5
  );
}

/**
 * Calculate the day of year (1-366) for a given date.
 */
export function dayOfYear(date: Date): number {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86400000) + 1;
}

/** Normalise an angle to the range [0, 360) */
function normaliseAngle(deg: number): number {
  let result = deg % 360;
  if (result < 0) result += 360;
  return result;
}

/** Clamp a value to [min, max] */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
