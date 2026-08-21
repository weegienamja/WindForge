import { describe, it, expect } from 'vitest';
import {
  extrapolateWindSpeed,
  roughnessClassToAlpha,
  REFERENCE_HEIGHT_M,
} from '../src/utils/wind-shear.js';

describe('roughnessClassToAlpha', () => {
  it('maps class 0 (water/open) to 0.10', () => {
    expect(roughnessClassToAlpha(0)).toBe(0.1);
  });

  it('maps class 1 (open terrain) to 0.14', () => {
    expect(roughnessClassToAlpha(1)).toBe(0.14);
  });

  it('maps class 2 (suburban) to 0.20', () => {
    expect(roughnessClassToAlpha(2)).toBe(0.2);
  });

  it('maps class 3 (urban/forest) to 0.25', () => {
    expect(roughnessClassToAlpha(3)).toBe(0.25);
  });

  it('falls back to default alpha (0.14) for out-of-range class', () => {
    expect(roughnessClassToAlpha(-1)).toBe(0.14);
    expect(roughnessClassToAlpha(5)).toBe(0.14);
  });
});

describe('extrapolateWindSpeed', () => {
  it('extrapolates 2m speed to 80m with alpha 0.14', () => {
    // v_hub = 4.5 * (80 / 2) ^ 0.14 = 4.5 * 40^0.14
    const result = extrapolateWindSpeed(4.5, 2, 80, 0.14);
    expect(result).toBeCloseTo(4.5 * Math.pow(40, 0.14), 2);
  });

  it('returns same speed when hub equals reference height', () => {
    const result = extrapolateWindSpeed(5.0, 10, 10, 0.14);
    expect(result).toBe(5.0);
  });

  it('returns higher speed at higher hub height', () => {
    const low = extrapolateWindSpeed(4.0, 2, 40, 0.14);
    const high = extrapolateWindSpeed(4.0, 2, 80, 0.14);
    expect(high).toBeGreaterThan(low);
  });

  it('returns higher speed with larger alpha', () => {
    const smoothAlpha = extrapolateWindSpeed(4.0, 2, 80, 0.1);
    const roughAlpha = extrapolateWindSpeed(4.0, 2, 80, 0.25);
    expect(roughAlpha).toBeGreaterThan(smoothAlpha);
  });

  it('returns 0 for 0 reference speed', () => {
    expect(extrapolateWindSpeed(0, 2, 80, 0.14)).toBe(0);
  });

  it('handles alpha = 0 (no shear)', () => {
    const result = extrapolateWindSpeed(5.0, 2, 80, 0);
    expect(result).toBe(5.0);
  });
});

describe('REFERENCE_HEIGHT_M', () => {
  it('is 2 metres (NASA POWER measurement height)', () => {
    expect(REFERENCE_HEIGHT_M).toBe(2);
  });
});
