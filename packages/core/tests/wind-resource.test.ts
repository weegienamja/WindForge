import { describe, it, expect } from 'vitest';
import { scoreWindResource } from '../src/scoring/wind-resource.js';
import type { WindScoringParams } from '../src/scoring/wind-resource.js';
import type { WindDataSummary } from '../src/types/datasources.js';

function makeWindData(overrides: Partial<WindDataSummary> = {}): WindDataSummary {
  return {
    coordinate: { lat: 55.86, lng: -4.25 },
    monthlyAverages: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      averageSpeedMs: 4.5,
      averageDirectionDeg: 240,
    })),
    annualAverageSpeedMs: 4.5,
    speedStdDevMs: 1.2,
    prevailingDirectionDeg: 240,
    directionalConsistency: 0.7,
    dataYears: 10,
    ...overrides,
  };
}

function makeParams(overrides: Partial<WindScoringParams> = {}): WindScoringParams {
  return {
    windData: makeWindData(),
    weight: 0.35,
    hubHeightM: 80,
    windShearAlpha: 0.14,
    ...overrides,
  };
}

describe('scoreWindResource', () => {
  it('returns a valid FactorScore', () => {
    const result = scoreWindResource(makeParams());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const score = result.value;
      expect(score.factor).toBe('windResource');
      expect(score.weight).toBe(0.35);
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
      expect(score.weightedScore).toBeCloseTo(score.score * 0.35, 1);
      expect(score.dataSource).toContain('NASA POWER');
      expect(score.detail).toBeTruthy();
    }
  });

  it('scores excellent wind highly', () => {
    const result = scoreWindResource(
      makeParams({
        windData: makeWindData({
          annualAverageSpeedMs: 8.0,
          speedStdDevMs: 0.5,
          directionalConsistency: 0.9,
        }),
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBeGreaterThanOrEqual(80);
    }
  });

  it('scores very low wind poorly', () => {
    const result = scoreWindResource(
      makeParams({
        windData: makeWindData({
          annualAverageSpeedMs: 0.5,
          speedStdDevMs: 0.3,
          directionalConsistency: 0.2,
        }),
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBeLessThan(20);
    }
  });

  it('scores zero wind speed at minimum', () => {
    const result = scoreWindResource(
      makeParams({
        windData: makeWindData({
          annualAverageSpeedMs: 0,
          speedStdDevMs: 0,
          directionalConsistency: 0,
        }),
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBe(0);
    }
  });

  it('has high confidence with 10 years of data', () => {
    const result = scoreWindResource(makeParams({ windData: makeWindData({ dataYears: 10 }) }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confidence).toBe('high');
    }
  });

  it('has medium confidence with 5 years of data', () => {
    const result = scoreWindResource(makeParams({ windData: makeWindData({ dataYears: 5 }) }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confidence).toBe('medium');
    }
  });

  it('has low confidence with 2 years of data', () => {
    const result = scoreWindResource(makeParams({ windData: makeWindData({ dataYears: 2 }) }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confidence).toBe('low');
    }
  });

  it('includes both raw and hub-height speed in detail', () => {
    const result = scoreWindResource(
      makeParams({
        windData: makeWindData({ annualAverageSpeedMs: 4.5 }),
        hubHeightM: 80,
        windShearAlpha: 0.14,
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toContain('4.5 m/s at 2m');
      expect(result.value.detail).toContain('at 80m hub height');
    }
  });

  it('extrapolates speed using wind shear power law', () => {
    // v_hub = v_ref * (h_hub / h_ref) ^ alpha
    // v_hub = 4.5 * (80 / 2) ^ 0.14 ≈ 4.5 * 40 ^ 0.14 ≈ 4.5 * 1.735 ≈ 7.8
    const result = scoreWindResource(
      makeParams({
        windData: makeWindData({ annualAverageSpeedMs: 4.5 }),
        hubHeightM: 80,
        windShearAlpha: 0.14,
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detail).toMatch(/7\.\d m\/s at 80m hub height/);
    }
  });

  it('applies zero weight correctly', () => {
    const result = scoreWindResource(makeParams({ weight: 0 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.weight).toBe(0);
      expect(result.value.weightedScore).toBe(0);
    }
  });

  it('uses higher alpha for rougher terrain', () => {
    const smooth = scoreWindResource(makeParams({ windShearAlpha: 0.10 }));
    const rough = scoreWindResource(makeParams({ windShearAlpha: 0.25 }));
    expect(smooth.ok && rough.ok).toBe(true);
    if (smooth.ok && rough.ok) {
      // Higher alpha -> more speed gain at hub height -> higher score
      expect(rough.value.score).toBeGreaterThan(smooth.value.score);
    }
  });

  it('lifts confidence to high when reconciliation confidence is high (short series)', () => {
    const shortSeries = makeWindData({ dataYears: 1 });
    const baseline = scoreWindResource(makeParams({ windData: shortSeries }));
    expect(baseline.ok).toBe(true);
    if (baseline.ok) {
      expect(baseline.value.confidence).toBe('low');
    }

    const lifted = scoreWindResource(
      makeParams({
        windData: shortSeries,
        reconciliation: {
          corrected: shortSeries,
          method: 'quantile',
          reference: 'cerra',
          confidence: 'high',
          detail: 'Reconciled against CERRA over 36 months.',
          diagnostics: {
            overlapMonths: 36,
            biasBeforeMs: 0.4,
            biasAfterMs: 0.02,
            rmseBeforeMs: 0.5,
            rmseAfterMs: 0.15,
            rSquared: 0.92,
            ksStatistic: 0.08,
          },
        },
      }),
    );
    expect(lifted.ok).toBe(true);
    if (lifted.ok) {
      expect(lifted.value.confidence).toBe('high');
      expect(lifted.value.detail).toContain('Reconciled against CERRA');
    }
  });
});
