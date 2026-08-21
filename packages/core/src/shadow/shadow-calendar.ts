import type { LatLng } from '../types/analysis.js';
import type { TurbinePosition } from '../types/wake.js';
import type { ShadowCalendar, ShadowCalendarEntry } from '../types/shadow.js';
import { calculateSolarPosition } from './solar-position.js';
import { isFlickerOccurring } from './shadow-flicker.js';

/**
 * Generate a shadow flicker calendar for a single receptor.
 * Produces a month x hour matrix showing how many days in each month/hour slot
 * experience shadow flicker. Useful for mitigation planning (turbine shutdown scheduling).
 *
 * @param turbines - Turbine positions
 * @param receptor - Receptor location
 * @param options - Optional: year, receptor height, rotor specs
 * @returns Shadow calendar with 12 x 24 matrix of flicker days
 */
export function generateShadowCalendar(
  turbines: TurbinePosition[],
  receptor: LatLng,
  options?: { year?: number; receptorHeightM?: number },
): ShadowCalendar {
  const year = options?.year ?? 2024;
  const receptorHeightM = options?.receptorHeightM ?? 2;

  // month (1-12) -> hour (0-23) -> count of days with flicker
  const matrix: number[][] = Array.from({ length: 12 }, () => Array.from({ length: 24 }, () => 0));

  let totalHours = 0;

  const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
  const current = new Date(startDate);

  while (current < endDate) {
    const sunPos = calculateSolarPosition(current, receptor);

    if (sunPos.isAboveHorizon && sunPos.elevationDeg > 1) {
      let flicker = false;
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
          flicker = true;
          break;
        }
      }

      if (flicker) {
        const month = current.getUTCMonth(); // 0-11
        const hour = current.getUTCHours();
        matrix[month]![hour]!++;
        totalHours++;
      }
    }

    current.setTime(current.getTime() + 3600000);
  }

  // Convert matrix to flat entries array
  const entries: ShadowCalendarEntry[] = [];
  for (let month = 0; month < 12; month++) {
    for (let hour = 0; hour < 24; hour++) {
      entries.push({
        month: month + 1,
        hour,
        flickerDays: matrix[month]![hour]!,
      });
    }
  }

  return {
    location: receptor,
    entries,
    totalHours,
  };
}

/**
 * Extract a summary of the shadow calendar showing which months have the most flicker.
 */
export function summariseShadowCalendar(calendar: ShadowCalendar): string {
  const monthTotals = new Map<number, number>();
  for (const entry of calendar.entries) {
    const current = monthTotals.get(entry.month) ?? 0;
    monthTotals.set(entry.month, current + entry.flickerDays);
  }

  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  if (calendar.totalHours === 0) {
    return 'No shadow flicker predicted at this receptor.';
  }

  const sorted = [...monthTotals.entries()].sort((a, b) => b[1] - a[1]);
  const worstMonth = sorted[0]!;

  return (
    `Total: ${calendar.totalHours} hours/year. ` +
    `Worst month: ${monthNames[worstMonth[0] - 1]} (${worstMonth[1]} hour-days).`
  );
}
