import { describe, it, expect } from 'vitest';
import {
  calculateSolarPosition,
  solarDeclination,
  dateToJulianDay,
  dayOfYear,
  calculateShadowFlicker,
  assessShadowThresholds,
  isFlickerOccurring,
  bearing,
  angleDifference,
  generateShadowCalendar,
  summariseShadowCalendar,
} from '../src/index.js';
import type { TurbinePosition } from '../src/types/wake.js';
import type { LatLng } from '../src/types/analysis.js';

// ─── Solar Position ───

describe('dateToJulianDay', () => {
  it('returns correct JD for J2000 epoch', () => {
    // J2000.0 = January 1.5, 2000 TT = JD 2451545.0
    const date = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
    expect(dateToJulianDay(date)).toBeCloseTo(2451545.0, 1);
  });

  it('returns correct JD for a known date', () => {
    // March 21, 2024 at noon UTC
    const date = new Date(Date.UTC(2024, 2, 21, 12, 0, 0));
    const jd = dateToJulianDay(date);
    expect(jd).toBeCloseTo(2460391.0, 0);
  });
});

describe('dayOfYear', () => {
  it('returns 1 for January 1st', () => {
    const date = new Date(Date.UTC(2024, 0, 1));
    expect(dayOfYear(date)).toBe(1);
  });

  it('returns 366 for Dec 31 in leap year', () => {
    const date = new Date(Date.UTC(2024, 11, 31));
    expect(dayOfYear(date)).toBe(366);
  });

  it('returns 365 for Dec 31 in non-leap year', () => {
    const date = new Date(Date.UTC(2023, 11, 31));
    expect(dayOfYear(date)).toBe(365);
  });
});

describe('solarDeclination', () => {
  it('is near zero at spring equinox', () => {
    const equinox = new Date(Date.UTC(2024, 2, 20, 12, 0, 0));
    const dec = solarDeclination(equinox);
    expect(Math.abs(dec)).toBeLessThan(1); // within 1 degree of zero
  });

  it('is near +23.4 at summer solstice', () => {
    const solstice = new Date(Date.UTC(2024, 5, 21, 12, 0, 0));
    const dec = solarDeclination(solstice);
    expect(dec).toBeGreaterThan(22);
    expect(dec).toBeLessThan(24);
  });

  it('is near -23.4 at winter solstice', () => {
    const solstice = new Date(Date.UTC(2024, 11, 21, 12, 0, 0));
    const dec = solarDeclination(solstice);
    expect(dec).toBeLessThan(-22);
    expect(dec).toBeGreaterThan(-24);
  });
});

describe('calculateSolarPosition', () => {
  it('places sun above horizon at noon in London summer', () => {
    const london: LatLng = { lat: 51.5, lng: -0.12 };
    const noonJune = new Date(Date.UTC(2024, 5, 21, 12, 0, 0));
    const pos = calculateSolarPosition(noonJune, london);

    expect(pos.isAboveHorizon).toBe(true);
    expect(pos.elevationDeg).toBeGreaterThan(50);
    expect(pos.elevationDeg).toBeLessThan(70);
    // Sun should be roughly south at noon in northern hemisphere
    expect(pos.azimuthDeg).toBeGreaterThan(150);
    expect(pos.azimuthDeg).toBeLessThan(210);
  });

  it('places sun below horizon at midnight in London', () => {
    const london: LatLng = { lat: 51.5, lng: -0.12 };
    const midnightJune = new Date(Date.UTC(2024, 5, 21, 0, 0, 0));
    const pos = calculateSolarPosition(midnightJune, london);

    expect(pos.isAboveHorizon).toBe(false);
    expect(pos.elevationDeg).toBeLessThan(0);
  });

  it('produces high elevation at equator noon on equinox', () => {
    const equator: LatLng = { lat: 0, lng: 0 };
    const equinox = new Date(Date.UTC(2024, 2, 20, 12, 0, 0));
    const pos = calculateSolarPosition(equinox, equator);

    expect(pos.isAboveHorizon).toBe(true);
    expect(pos.elevationDeg).toBeGreaterThan(80);
  });

  it('returns valid azimuth between 0 and 360', () => {
    const london: LatLng = { lat: 51.5, lng: -0.12 };
    // Check multiple times of day
    for (let hour = 0; hour < 24; hour++) {
      const date = new Date(Date.UTC(2024, 5, 21, hour, 0, 0));
      const pos = calculateSolarPosition(date, london);
      expect(pos.azimuthDeg).toBeGreaterThanOrEqual(0);
      expect(pos.azimuthDeg).toBeLessThan(360);
    }
  });

  it('sun is in the east in the morning', () => {
    const london: LatLng = { lat: 51.5, lng: -0.12 };
    // 8:00 UTC in June is morning in London
    const morning = new Date(Date.UTC(2024, 5, 21, 8, 0, 0));
    const pos = calculateSolarPosition(morning, london);

    expect(pos.isAboveHorizon).toBe(true);
    // East is roughly 45-135 degrees
    expect(pos.azimuthDeg).toBeGreaterThan(45);
    expect(pos.azimuthDeg).toBeLessThan(150);
  });
});

// ─── Bearing and Angle Utilities ───

describe('bearing', () => {
  it('returns 0 for due north', () => {
    const from: LatLng = { lat: 50, lng: 0 };
    const to: LatLng = { lat: 51, lng: 0 };
    expect(bearing(from, to)).toBeCloseTo(0, 0);
  });

  it('returns ~90 for due east', () => {
    const from: LatLng = { lat: 50, lng: 0 };
    const to: LatLng = { lat: 50, lng: 1 };
    const b = bearing(from, to);
    expect(b).toBeGreaterThan(85);
    expect(b).toBeLessThan(95);
  });

  it('returns ~180 for due south', () => {
    const from: LatLng = { lat: 50, lng: 0 };
    const to: LatLng = { lat: 49, lng: 0 };
    expect(bearing(from, to)).toBeCloseTo(180, 0);
  });

  it('returns ~270 for due west', () => {
    const from: LatLng = { lat: 50, lng: 0 };
    const to: LatLng = { lat: 50, lng: -1 };
    const b = bearing(from, to);
    expect(b).toBeGreaterThan(265);
    expect(b).toBeLessThan(275);
  });
});

describe('angleDifference', () => {
  it('returns 0 for same angle', () => {
    expect(angleDifference(90, 90)).toBe(0);
  });

  it('handles wrap-around', () => {
    expect(angleDifference(10, 350)).toBeCloseTo(20, 5);
    expect(angleDifference(350, 10)).toBeCloseTo(-20, 5);
  });

  it('returns values in range [-180, 180]', () => {
    expect(angleDifference(0, 270)).toBe(90);
    expect(angleDifference(270, 0)).toBe(-90);
  });
});

// ─── Shadow Flicker Detection ───

describe('isFlickerOccurring', () => {
  const turbine: TurbinePosition = {
    id: 1,
    location: { lat: 55.0, lng: -3.0 },
    hubHeightM: 80,
    rotorDiameterM: 90,
  };

  it('detects flicker when receptor is in shadow path', () => {
    // Receptor directly south of turbine, sun from north (shadow falls south)
    // This is a simplified geometric test
    const receptor: LatLng = { lat: 54.998, lng: -3.0 }; // ~220m south
    // Sun from the north at low elevation
    const result = isFlickerOccurring(turbine, receptor, 0, 5, 2);
    // Sun azimuth 0 (north), shadow cast south - receptor is south
    expect(result).toBe(true);
  });

  it('no flicker when receptor is too far away', () => {
    // Receptor 10km away - beyond 10x rotor diameter (900m)
    const receptor: LatLng = { lat: 55.1, lng: -3.0 };
    const result = isFlickerOccurring(turbine, receptor, 180, 10, 2);
    expect(result).toBe(false);
  });

  it('no flicker when receptor is on same side as sun', () => {
    // Receptor south, sun also from south - no shadow toward receptor
    const receptor: LatLng = { lat: 54.999, lng: -3.0 };
    const result = isFlickerOccurring(turbine, receptor, 180, 30, 2);
    expect(result).toBe(false);
  });

  it('no flicker when sun is at very high elevation (short shadow)', () => {
    // Sun at high elevation - shadow too short to reach receptor
    const receptor: LatLng = { lat: 54.995, lng: -3.0 }; // ~556m south
    // At 80 deg elevation, shadow ~ 80m/tan(80deg) = ~14m - too short
    const result = isFlickerOccurring(turbine, receptor, 0, 80, 2);
    expect(result).toBe(false);
  });
});

// ─── Shadow Flicker Calculation ───

describe('calculateShadowFlicker', () => {
  const turbine: TurbinePosition = {
    id: 1,
    location: { lat: 55.0, lng: -3.0 },
    hubHeightM: 80,
    rotorDiameterM: 90,
  };

  it('returns zero flicker for receptor far from turbine', () => {
    const receptor: LatLng = { lat: 56.0, lng: -3.0 }; // ~111km away
    const result = calculateShadowFlicker([turbine], [receptor], { year: 2024 });
    expect(result.receptors).toHaveLength(1);
    expect(result.receptors[0].hoursPerYear).toBe(0);
    expect(result.worstCaseHoursPerYear).toBe(0);
    expect(result.summary).toContain('No shadow flicker');
  });

  it('returns non-zero flicker for nearby receptor', () => {
    // Receptor 200m north of turbine - close enough for shadow
    const receptor: LatLng = { lat: 55.0018, lng: -3.0 };
    const result = calculateShadowFlicker([turbine], [receptor], { year: 2024 });
    expect(result.receptors).toHaveLength(1);
    // Should have some flicker hours (sun from south casts shadow north)
    expect(result.receptors[0].hoursPerYear).toBeGreaterThan(0);
    expect(result.summary).toContain('Shadow flicker predicted');
  });

  it('handles multiple receptors', () => {
    const receptors: LatLng[] = [
      { lat: 55.0018, lng: -3.0 }, // close, north
      { lat: 56.0, lng: -3.0 }, // far away
    ];
    const result = calculateShadowFlicker([turbine], receptors, { year: 2024 });
    expect(result.receptors).toHaveLength(2);
    expect(result.receptors[0].hoursPerYear).toBeGreaterThan(0);
    expect(result.receptors[1].hoursPerYear).toBe(0);
  });

  it('produces 12 months in minutesPerDay', () => {
    const receptor: LatLng = { lat: 55.0018, lng: -3.0 };
    const result = calculateShadowFlicker([turbine], [receptor], { year: 2024 });
    expect(result.receptors[0].minutesPerDay).toHaveLength(12);
    result.receptors[0].minutesPerDay.forEach((m, i) => {
      expect(m.month).toBe(i + 1);
      expect(m.maxMinutes).toBeGreaterThanOrEqual(0);
    });
  });

  it('handles empty turbine list', () => {
    const receptor: LatLng = { lat: 55.0018, lng: -3.0 };
    const result = calculateShadowFlicker([], [receptor], { year: 2024 });
    expect(result.receptors[0].hoursPerYear).toBe(0);
  });
});

// ─── Shadow Compliance ───

describe('assessShadowThresholds', () => {
  it('marks estimates within configured thresholds', () => {
    const result = assessShadowThresholds(
      {
        receptors: [
          {
            location: { lat: 55, lng: -3 },
            hoursPerYear: 50,
            minutesPerDay: Array.from({ length: 12 }, (_, i) => ({
              month: i + 1,
              maxMinutes: 40,
            })),
          },
        ],
        worstCaseHoursPerYear: 50,
        summary: '',
      },
      { maxHoursPerYear: 30, maxMinutesPerDay: 30, sunshineFraction: 0.32 },
    );
    // 50 * 0.32 = 16 expected hours, 40 * 0.32 = 12.8 minutes
    expect(result.overallWithinThresholds).toBe(true);
    expect(result.receptors[0].expectedHoursPerYear).toBeCloseTo(16, 0);
    expect(result.summary).toContain('configured screening thresholds');
    expect(result.disclaimer).toContain('not a planning compliance assessment');
  });

  it('marks an annual screening-threshold exceedance', () => {
    const result = assessShadowThresholds(
      {
        receptors: [
          {
            location: { lat: 55, lng: -3 },
            hoursPerYear: 200,
            minutesPerDay: Array.from({ length: 12 }, (_, i) => ({
              month: i + 1,
              maxMinutes: 60,
            })),
          },
        ],
        worstCaseHoursPerYear: 200,
        summary: '',
      },
      { maxHoursPerYear: 30, maxMinutesPerDay: 30, sunshineFraction: 0.32 },
    );
    // 200 * 0.32 = 64 expected hours - exceeds 30h limit
    expect(result.overallWithinThresholds).toBe(false);
    expect(result.receptors[0].withinAnnualThreshold).toBe(false);
  });

  it('uses default UK sunshine fraction of 0.32', () => {
    const result = assessShadowThresholds({
      receptors: [
        {
          location: { lat: 55, lng: -3 },
          hoursPerYear: 80,
          minutesPerDay: Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            maxMinutes: 0,
          })),
        },
      ],
      worstCaseHoursPerYear: 80,
      summary: '',
    });
    // 80 * 0.32 = 25.6 (within the default 30h screening threshold)
    expect(result.overallWithinThresholds).toBe(true);
    expect(result.receptors[0].expectedHoursPerYear).toBeCloseTo(25.6, 0);
  });

  it('generates a meaningful threshold-exceedance summary', () => {
    const result = assessShadowThresholds(
      {
        receptors: [
          {
            location: { lat: 55, lng: -3 },
            hoursPerYear: 300,
            minutesPerDay: Array.from({ length: 12 }, (_, i) => ({
              month: i + 1,
              maxMinutes: 120,
            })),
          },
        ],
        worstCaseHoursPerYear: 300,
        summary: '',
      },
      { sunshineFraction: 0.5 },
    );
    expect(result.summary).toContain('exceed the configured screening thresholds');
    expect(result.worstCaseExpectedHoursPerYear).toBeCloseTo(150, 0);
  });
});

// ─── Shadow Calendar ───

describe('generateShadowCalendar', () => {
  const turbine: TurbinePosition = {
    id: 1,
    location: { lat: 55.0, lng: -3.0 },
    hubHeightM: 80,
    rotorDiameterM: 90,
  };

  it('produces 288 entries (12 months x 24 hours)', () => {
    const receptor: LatLng = { lat: 56.0, lng: -3.0 }; // far away, no flicker
    const cal = generateShadowCalendar([turbine], receptor, { year: 2024 });
    expect(cal.entries).toHaveLength(288);
  });

  it('has zero total for far receptor', () => {
    const receptor: LatLng = { lat: 56.0, lng: -3.0 };
    const cal = generateShadowCalendar([turbine], receptor, { year: 2024 });
    expect(cal.totalHours).toBe(0);
  });

  it('has non-zero total for nearby receptor', () => {
    const receptor: LatLng = { lat: 55.0018, lng: -3.0 };
    const cal = generateShadowCalendar([turbine], receptor, { year: 2024 });
    expect(cal.totalHours).toBeGreaterThan(0);
    // Flicker should mostly occur during certain hours
    const flickerEntries = cal.entries.filter((e) => e.flickerDays > 0);
    expect(flickerEntries.length).toBeGreaterThan(0);
    expect(flickerEntries.length).toBeLessThan(288); // not all slots
  });

  it('entries have valid month and hour ranges', () => {
    const receptor: LatLng = { lat: 55.0018, lng: -3.0 };
    const cal = generateShadowCalendar([turbine], receptor, { year: 2024 });
    for (const entry of cal.entries) {
      expect(entry.month).toBeGreaterThanOrEqual(1);
      expect(entry.month).toBeLessThanOrEqual(12);
      expect(entry.hour).toBeGreaterThanOrEqual(0);
      expect(entry.hour).toBeLessThanOrEqual(23);
      expect(entry.flickerDays).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('summariseShadowCalendar', () => {
  it('returns no-flicker message for empty calendar', () => {
    const cal = {
      location: { lat: 55, lng: -3 },
      entries: Array.from({ length: 288 }, (_, i) => ({
        month: Math.floor(i / 24) + 1,
        hour: i % 24,
        flickerDays: 0,
      })),
      totalHours: 0,
    };
    const summary = summariseShadowCalendar(cal);
    expect(summary).toContain('No shadow flicker');
  });

  it('reports worst month for non-zero calendar', () => {
    const entries = Array.from({ length: 288 }, (_, i) => ({
      month: Math.floor(i / 24) + 1,
      hour: i % 24,
      flickerDays: 0,
    }));
    // Add some flicker in March (month 3)
    entries[2 * 24 + 10].flickerDays = 5; // March, 10:00
    entries[2 * 24 + 11].flickerDays = 3; // March, 11:00

    const cal = {
      location: { lat: 55, lng: -3 },
      entries,
      totalHours: 8,
    };
    const summary = summariseShadowCalendar(cal);
    expect(summary).toContain('Mar');
    expect(summary).toContain('8 hours/year');
  });
});
