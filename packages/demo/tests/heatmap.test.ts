import { describe, expect, it } from 'vitest';
import { cellStepDeg, parseWindSpeedMs, scoreColor } from '../src/lib/heatmap';

describe('scoreColor', () => {
  it('returns a hex colour for any score in range', () => {
    for (const s of [0, 10, 25, 50, 62, 80, 100]) {
      expect(scoreColor(s)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('clamps out-of-range scores to the endpoints', () => {
    expect(scoreColor(-50)).toBe(scoreColor(0));
    expect(scoreColor(150)).toBe(scoreColor(100));
  });

  it('moves continuously up the ramp (low and high ends differ)', () => {
    expect(scoreColor(5)).not.toBe(scoreColor(95));
  });
});

describe('cellStepDeg', () => {
  it('derives latitude/longitude steps from km spacing', () => {
    const { latStepDeg, lngStepDeg } = cellStepDeg(25, 54.5);
    // ~25 km in latitude ≈ 0.224°.
    expect(latStepDeg).toBeCloseTo(0.2246, 3);
    // Longitude degrees are wider apart than latitude at UK latitudes.
    expect(lngStepDeg).toBeGreaterThan(latStepDeg);
  });
});

describe('parseWindSpeedMs', () => {
  it('returns the highest m/s figure in the detail text', () => {
    expect(
      parseWindSpeedMs('4.3 m/s at 2m, 7.2 m/s at 50m, 8.6 m/s at 100m hub height'),
    ).toBe(8.6);
  });

  it('returns null when there is no speed', () => {
    expect(parseWindSpeedMs('No wind data available.')).toBeNull();
    expect(parseWindSpeedMs(undefined)).toBeNull();
  });
});
