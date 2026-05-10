import { describe, it, expect } from 'vitest';
import {
  alignByYearMonth,
  computeBias,
  computeRmse,
  computeRSquared,
  computeKsStatistic,
  applyVarianceScaling,
  applyQuantileMapping,
  applyLinearScaling,
} from '../src/analysis/bias-correction.js';
import type { MonthlyWindHistory, MonthlyWindRecord } from '../src/types/datasources.js';

// ─── Helpers ───

/** Seeded LCG so synthetic tests are deterministic. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Box-Muller standard normal from a seeded RNG. */
function normal(rand: () => number, mean: number, sd: number): number {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sd * z;
}

function makeHistory(records: Array<{ year: number; month: number; ws: number }>): MonthlyWindHistory {
  return {
    coordinate: { lat: 0, lng: 0 },
    startYear: records[0]?.year ?? 0,
    endYear: records[records.length - 1]?.year ?? 0,
    records: records.map<MonthlyWindRecord>((r) => ({
      year: r.year,
      month: r.month,
      ws2m: 0,
      ws10m: 0,
      ws50m: r.ws,
      wd10m: 240,
      wd50m: 240,
    })),
  };
}

function arrMean(a: number[]): number {
  return a.reduce((s, v) => s + v, 0) / a.length;
}

function arrSd(a: number[]): number {
  const m = arrMean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length);
}

function quantile(sorted: number[], q: number): number {
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo] as number;
  const frac = pos - lo;
  return (sorted[lo] as number) * (1 - frac) + (sorted[hi] as number) * frac;
}

// ─── Diagnostics ───

describe('computeBias / computeRmse / computeRSquared / computeKsStatistic', () => {
  it('computeBias([10,10],[8,8]) === 2', () => {
    expect(computeBias([10, 10], [8, 8])).toBe(2);
  });

  it('computeRmse([10],[8]) === 2', () => {
    expect(computeRmse([10], [8])).toBe(2);
  });

  it('computeRSquared identical series === 1', () => {
    expect(computeRSquared([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 12);
  });

  it('computeBias of empty arrays === 0', () => {
    expect(computeBias([], [])).toBe(0);
  });

  it('KS of identical samples === 0', () => {
    expect(computeKsStatistic([1, 2, 3, 4], [1, 2, 3, 4])).toBe(0);
  });

  it('KS of fully disjoint samples === 1', () => {
    expect(computeKsStatistic([1, 2, 3], [10, 11, 12])).toBe(1);
  });
});

// ─── alignByYearMonth ───

describe('alignByYearMonth', () => {
  it('intersects on (year, month) and produces equal-length arrays', () => {
    const nasa = makeHistory([
      { year: 2020, month: 1, ws: 5 },
      { year: 2020, month: 2, ws: 6 },
      { year: 2020, month: 3, ws: 7 },
    ]);
    const reference = makeHistory([
      { year: 2020, month: 2, ws: 5.5 },
      { year: 2020, month: 3, ws: 6.5 },
      { year: 2020, month: 4, ws: 7.5 },
    ]);
    const aligned = alignByYearMonth(nasa, reference);
    expect(aligned.nasa).toHaveLength(2);
    expect(aligned.reference).toHaveLength(2);
    expect(aligned.months).toEqual([
      { year: 2020, month: 2 },
      { year: 2020, month: 3 },
    ]);
    expect(aligned.nasa).toEqual([6, 7]);
    expect(aligned.reference).toEqual([5.5, 6.5]);
  });

  it('returns empty arrays when no overlap', () => {
    const nasa = makeHistory([{ year: 2020, month: 1, ws: 5 }]);
    const reference = makeHistory([{ year: 2021, month: 1, ws: 6 }]);
    const aligned = alignByYearMonth(nasa, reference);
    expect(aligned.nasa).toHaveLength(0);
  });

  it('falls back through 50m -> 10m -> 2m when higher heights are zero', () => {
    const nasa: MonthlyWindHistory = {
      coordinate: { lat: 0, lng: 0 },
      startYear: 2020,
      endYear: 2020,
      records: [
        { year: 2020, month: 1, ws2m: 3, ws10m: 0, ws50m: 0, wd10m: 0, wd50m: 0 },
      ],
    };
    const ref = makeHistory([{ year: 2020, month: 1, ws: 7 }]);
    const aligned = alignByYearMonth(nasa, ref);
    expect(aligned.nasa).toEqual([3]);
    expect(aligned.reference).toEqual([7]);
  });
});

// ─── Variance scaling ───

describe('applyVarianceScaling', () => {
  it('synthetic recovery: corrected mean and sd match truth', () => {
    const rand = rng(42);
    const truth = Array.from({ length: 240 }, () => normal(rand, 8, 2));
    const nasa = truth.map((t) => 0.85 * t + 0.5);
    const corrected = applyVarianceScaling(nasa, nasa, truth);
    expect(arrMean(corrected)).toBeCloseTo(arrMean(truth), 1);
    expect(Math.abs(arrSd(corrected) - arrSd(truth))).toBeLessThan(0.1);
  });

  it('returns values unchanged when nasa == reference', () => {
    const v = [1, 2, 3, 4, 5];
    const out = applyVarianceScaling(v, v, v);
    expect(out).toEqual(v);
  });

  it('returns values unchanged when nasa has zero variance', () => {
    const v = [4, 5, 6];
    const constNasa = [3, 3, 3];
    const out = applyVarianceScaling(v, constNasa, [10, 11, 12]);
    expect(out).toEqual(v);
  });

  it('returns empty array on empty input', () => {
    expect(applyVarianceScaling([], [], [])).toEqual([]);
  });
});

// ─── Quantile mapping ───

describe('applyQuantileMapping', () => {
  it('synthetic recovery: corrected percentiles within 0.15 m/s of truth', () => {
    const rand = rng(7);
    const truth = Array.from({ length: 480 }, () => normal(rand, 8, 2));
    const nasa = truth.map((t) => 0.85 * t + 0.5);
    const corrected = applyQuantileMapping(nasa, nasa, truth);
    const sortedTruth = [...truth].sort((a, b) => a - b);
    const sortedCorr = [...corrected].sort((a, b) => a - b);
    for (const q of [0.10, 0.25, 0.50, 0.75, 0.90]) {
      const dq = Math.abs(quantile(sortedCorr, q) - quantile(sortedTruth, q));
      expect(dq).toBeLessThan(0.15);
    }
  });

  it('round-trip: nasa == reference returns values unchanged', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = applyQuantileMapping(v, v, v);
    for (let i = 0; i < v.length; i++) {
      expect(out[i]).toBeCloseTo(v[i] as number, 9);
    }
  });

  it('clips at reference max (does not extrapolate)', () => {
    const nasa = [1, 2, 3, 4];
    const reference = [10, 11, 12, 13];
    const out = applyQuantileMapping([100], nasa, reference);
    expect(out[0]).toBe(13);
  });

  it('clips at reference min (does not extrapolate)', () => {
    const out = applyQuantileMapping([-50], [1, 2, 3, 4], [10, 11, 12, 13]);
    expect(out[0]).toBe(10);
  });

  it('monotonicity: sorted input yields sorted output', () => {
    const nasa = [1, 2, 3, 4, 5, 6, 7, 8];
    const reference = [2, 4, 6, 8, 10, 12, 14, 16];
    const input = [1.5, 2.5, 4.5, 6.5];
    const out = applyQuantileMapping(input, nasa, reference);
    for (let i = 1; i < out.length; i++) {
      expect(out[i] as number).toBeGreaterThanOrEqual(out[i - 1] as number);
    }
  });

  it('returns empty array on empty input', () => {
    expect(applyQuantileMapping([], [1, 2], [3, 4])).toEqual([]);
  });
});

// ─── Linear scaling ───

describe('applyLinearScaling', () => {
  it('round-trip: nasa == reference returns values unchanged', () => {
    const v = [1, 2, 3, 4, 5];
    const out = applyLinearScaling(v, v, v);
    for (let i = 0; i < v.length; i++) {
      expect(out[i]).toBeCloseTo(v[i] as number, 9);
    }
  });

  it('exact recovery when nasa = a + b * reference', () => {
    const reference = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = 0.5;
    const b = 1.3;
    const nasa = reference.map((r) => a + b * r);
    // Inverse: reference = (nasa - a) / b. Linear OLS should learn that.
    const out = applyLinearScaling(nasa, nasa, reference);
    for (let i = 0; i < reference.length; i++) {
      expect(out[i] as number).toBeCloseTo(reference[i] as number, 9);
    }
  });

  it('returns empty array on empty input', () => {
    expect(applyLinearScaling([], [], [])).toEqual([]);
  });

  it('falls back to mean shift when nasa has zero variance', () => {
    const out = applyLinearScaling([1, 2, 3], [5, 5, 5], [7, 8, 9]);
    // shift = meanY - meanX = 8 - 5 = 3
    expect(out).toEqual([4, 5, 6]);
  });
});
