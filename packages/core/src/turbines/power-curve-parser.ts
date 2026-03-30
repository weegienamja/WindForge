import type { PowerCurvePoint } from '../types/turbines.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';

/**
 * Parse a CSV string into power curve points.
 * Expected columns: wind_speed_ms,power_kw
 * Validates monotonically increasing power up to rated,
 * zero below cut-in, zero above cut-out.
 */
export function parsePowerCurveCSV(csv: string): Result<PowerCurvePoint[], ScoringError> {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) {
    return err(scoringError(ScoringErrorCode.Unknown, 'CSV must have a header row and at least one data row'));
  }

  // Validate header
  const header = lines[0]!.toLowerCase().replace(/\s/g, '');
  if (!header.includes('wind_speed') || !header.includes('power')) {
    return err(scoringError(ScoringErrorCode.Unknown, 'CSV header must contain "wind_speed_ms" and "power_kw" columns'));
  }

  const points: PowerCurvePoint[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.length === 0) continue;

    const parts = line.split(',');
    if (parts.length < 2) {
      return err(scoringError(ScoringErrorCode.Unknown, `Invalid CSV row ${i + 1}: expected at least 2 columns`));
    }

    const windSpeedMs = Number.parseFloat(parts[0]!);
    const powerKw = Number.parseFloat(parts[1]!);

    if (!Number.isFinite(windSpeedMs) || !Number.isFinite(powerKw)) {
      return err(scoringError(ScoringErrorCode.Unknown, `Invalid numeric values on row ${i + 1}`));
    }

    if (windSpeedMs < 0 || powerKw < 0) {
      return err(scoringError(ScoringErrorCode.Unknown, `Negative values on row ${i + 1}`));
    }

    points.push({ windSpeedMs, powerKw });
  }

  if (points.length < 3) {
    return err(scoringError(ScoringErrorCode.Unknown, 'Power curve must have at least 3 data points'));
  }

  // Sort by wind speed
  points.sort((a, b) => a.windSpeedMs - b.windSpeedMs);

  // Validate: find cut-in (first non-zero), rated speed (peak power), cut-out (first zero after rated)
  let peakPower = 0;
  let peakIndex = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i]!.powerKw > peakPower) {
      peakPower = points[i]!.powerKw;
      peakIndex = i;
    }
  }

  // Check monotonically increasing power up to rated speed
  for (let i = 1; i <= peakIndex; i++) {
    if (points[i]!.powerKw < points[i - 1]!.powerKw - 0.1) {
      return err(scoringError(
        ScoringErrorCode.Unknown,
        `Power curve is not monotonically increasing below rated speed at ${points[i]!.windSpeedMs} m/s`,
      ));
    }
  }

  // Interpolate to 0.5 m/s increments
  const interpolated = interpolateCurve(points, 0.5);
  return ok(interpolated);
}

function interpolateCurve(points: PowerCurvePoint[], stepMs: number): PowerCurvePoint[] {
  if (points.length === 0) return [];

  const minSpeed = 0;
  const maxSpeed = Math.max(30, points[points.length - 1]!.windSpeedMs);
  const result: PowerCurvePoint[] = [];

  for (let speed = minSpeed; speed <= maxSpeed; speed += stepMs) {
    const power = interpolatePower(points, speed);
    result.push({ windSpeedMs: Math.round(speed * 10) / 10, powerKw: Math.round(power * 10) / 10 });
  }

  return result;
}

function interpolatePower(points: PowerCurvePoint[], speed: number): number {
  if (speed <= points[0]!.windSpeedMs) return points[0]!.powerKw;
  if (speed >= points[points.length - 1]!.windSpeedMs) return points[points.length - 1]!.powerKw;

  for (let i = 1; i < points.length; i++) {
    if (speed <= points[i]!.windSpeedMs) {
      const prev = points[i - 1]!;
      const curr = points[i]!;
      const t = (speed - prev.windSpeedMs) / (curr.windSpeedMs - prev.windSpeedMs);
      return prev.powerKw + t * (curr.powerKw - prev.powerKw);
    }
  }

  return 0;
}
