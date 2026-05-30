import { describe, expect, it } from 'vitest';
import { cellStepDeg, makeRelativeColor, parseWindSpeedMs, scoreColor } from '../src/lib/heatmap';

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

describe('makeRelativeColor', () => {
  it('spreads tightly-clustered values across the palette', () => {
    const clustered = [66, 67, 67, 68, 66, 68, 67];
    const { color } = makeRelativeColor(clustered);
    // The lowest and highest of a near-uniform cluster should differ in colour.
    expect(color(66)).not.toBe(color(68));
  });

  it('inverts so that lower values are "best" when invert is set (LCOE)', () => {
    const lcoe = [45, 55, 65, 75, 85];
    const normal = makeRelativeColor(lcoe);
    const inverted = makeRelativeColor(lcoe, { invert: true });
    // Lowest LCOE under invert should match the highest value's colour without invert.
    expect(inverted.color(45)).toBe(normal.color(85));
  });

  it('reports the percentile domain it used', () => {
    const { lo, hi } = makeRelativeColor([10, 20, 30, 40, 50]);
    expect(hi).toBeGreaterThan(lo);
  });

  it('handles an empty set without throwing', () => {
    const { color } = makeRelativeColor([]);
    expect(color(0)).toMatch(/^#[0-9a-f]{6}$/);
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
