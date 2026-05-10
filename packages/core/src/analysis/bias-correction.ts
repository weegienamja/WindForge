// Pure statistical primitives for bias correction of monthly wind speeds.
//
// All functions are deterministic and side-effect free. They take plain
// number arrays in m/s and never touch I/O.

import type { MonthlyWindHistory } from '../types/datasources.js';

/**
 * Aligns two monthly wind histories on (year, month). Order is preserved
 * by ascending year then month. Returns equal-length arrays of best-available
 * speed (50m if non-zero, else 10m, else 2m) for each shared month.
 */
export function alignByYearMonth(
  nasa: MonthlyWindHistory,
  reference: MonthlyWindHistory,
): {
  nasa: number[];
  reference: number[];
  months: Array<{ year: number; month: number }>;
} {
  const refKey = new Map<string, number>();
  for (const r of reference.records) {
    refKey.set(`${r.year}-${r.month}`, bestSpeedMs(r.ws50m, r.ws10m, r.ws2m));
  }

  const out: { year: number; month: number; nasa: number; reference: number }[] = [];
  for (const r of nasa.records) {
    const key = `${r.year}-${r.month}`;
    const refSpeed = refKey.get(key);
    if (refSpeed === undefined) continue;
    out.push({
      year: r.year,
      month: r.month,
      nasa: bestSpeedMs(r.ws50m, r.ws10m, r.ws2m),
      reference: refSpeed,
    });
  }

  out.sort((a, b) => (a.year - b.year) || (a.month - b.month));

  return {
    nasa: out.map((o) => o.nasa),
    reference: out.map((o) => o.reference),
    months: out.map((o) => ({ year: o.year, month: o.month })),
  };
}

function bestSpeedMs(ws50: number, ws10: number, ws2: number): number {
  if (ws50 > 0) return ws50;
  if (ws10 > 0) return ws10;
  return ws2;
}

/** Mean of `nasa[i] - reference[i]`. Returns 0 when arrays are empty. */
export function computeBias(nasa: number[], reference: number[]): number {
  const n = Math.min(nasa.length, reference.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (nasa[i] as number) - (reference[i] as number);
  return sum / n;
}

/** Root-mean-square error between paired arrays. Returns 0 when empty. */
export function computeRmse(nasa: number[], reference: number[]): number {
  const n = Math.min(nasa.length, reference.length);
  if (n === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const d = (nasa[i] as number) - (reference[i] as number);
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / n);
}

/**
 * Coefficient of determination R^2 of `reference` predicted by `nasa` using
 * a simple identity model (i.e. how well NASA tracks reference). Returns 0
 * for fewer than two points or zero variance in reference.
 */
export function computeRSquared(nasa: number[], reference: number[]): number {
  const n = Math.min(nasa.length, reference.length);
  if (n < 2) return 0;
  const refMean = mean(reference, n);
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const r = reference[i] as number;
    const p = nasa[i] as number;
    ssRes += (r - p) * (r - p);
    ssTot += (r - refMean) * (r - refMean);
  }
  if (ssTot === 0) return 0;
  const r2 = 1 - ssRes / ssTot;
  // R^2 is conventionally clipped to [0, 1] for goodness-of-fit reporting.
  return Math.max(0, Math.min(1, r2));
}

/**
 * Kolmogorov-Smirnov statistic: maximum absolute difference between the two
 * empirical CDFs. Returns 0 for empty inputs and 1 for fully disjoint sets.
 */
export function computeKsStatistic(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  const allValues = [...new Set([...sortedA, ...sortedB])].sort((x, y) => x - y);

  let maxDiff = 0;
  for (const v of allValues) {
    const cdfA = cdfAt(sortedA, v);
    const cdfB = cdfAt(sortedB, v);
    const diff = Math.abs(cdfA - cdfB);
    if (diff > maxDiff) maxDiff = diff;
  }
  return maxDiff;
}

function cdfAt(sorted: number[], v: number): number {
  // Count of elements <= v, divided by length.
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] as number) <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo / sorted.length;
}

/**
 * Variance scaling: shifts and rescales `values` so they have the same
 * mean and standard deviation as `reference`, where the original NASA
 * mean and sd are taken from the `nasa` overlap series.
 *
 * Formula: `out_i = mean_ref + (values_i - mean_nasa) * (sd_ref / sd_nasa)`.
 *
 * If `sd_nasa` is zero or the inputs are empty, returns `values` unchanged.
 */
export function applyVarianceScaling(
  values: number[],
  nasa: number[],
  reference: number[],
): number[] {
  if (values.length === 0 || nasa.length === 0 || reference.length === 0) {
    return [...values];
  }
  const meanNasa = mean(nasa, nasa.length);
  const meanRef = mean(reference, reference.length);
  const sdNasa = stdDev(nasa, meanNasa);
  const sdRef = stdDev(reference, meanRef);
  if (sdNasa === 0) return [...values];
  const scale = sdRef / sdNasa;
  return values.map((v) => meanRef + (v - meanNasa) * scale);
}

/**
 * Empirical quantile mapping: for each input value, find its percentile in
 * the NASA distribution, then return the value at that percentile in the
 * reference distribution. Values outside the NASA range are clipped to the
 * reference's min/max (no extrapolation).
 *
 * Linear interpolation is used between adjacent order statistics. Ties are
 * handled deterministically: `quantileAt(sorted, q)` interpolates between
 * the two surrounding points.
 */
export function applyQuantileMapping(
  values: number[],
  nasa: number[],
  reference: number[],
): number[] {
  if (values.length === 0 || nasa.length === 0 || reference.length === 0) {
    return [...values];
  }
  const sortedNasa = [...nasa].sort((a, b) => a - b);
  const sortedRef = [...reference].sort((a, b) => a - b);
  const minRef = sortedRef[0] as number;
  const maxRef = sortedRef[sortedRef.length - 1] as number;
  const minNasa = sortedNasa[0] as number;
  const maxNasa = sortedNasa[sortedNasa.length - 1] as number;

  return values.map((v) => {
    if (v <= minNasa) return minRef;
    if (v >= maxNasa) return maxRef;
    const q = empiricalQuantileOf(sortedNasa, v);
    return quantileAt(sortedRef, q);
  });
}

/**
 * Empirical quantile (in [0, 1]) of value `v` within the sorted array.
 * Uses linear interpolation between adjacent points; assumes strict bounds
 * have already been handled by the caller.
 */
function empiricalQuantileOf(sorted: number[], v: number): number {
  // Find first index with sorted[i] >= v.
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] as number) < v) lo = mid + 1;
    else hi = mid;
  }
  const i = lo;
  if (i === 0) return 0;
  if (i >= sorted.length) return 1;
  const xLo = sorted[i - 1] as number;
  const xHi = sorted[i] as number;
  if (xHi === xLo) return (i - 0.5) / sorted.length;
  const frac = (v - xLo) / (xHi - xLo);
  return ((i - 1) + frac) / (sorted.length - 1);
}

/** Linearly interpolated value at empirical quantile `q` (in [0, 1]). */
function quantileAt(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] as number;
  if (q <= 0) return sorted[0] as number;
  if (q >= 1) return sorted[sorted.length - 1] as number;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo] as number;
  const frac = pos - lo;
  return (sorted[lo] as number) * (1 - frac) + (sorted[hi] as number) * frac;
}

/**
 * Linear scaling via OLS fit `reference = a + b * nasa`, then applies
 * `out_i = a + b * values_i`. If `nasa` has zero variance, returns
 * `values` shifted by the mean bias.
 */
export function applyLinearScaling(
  values: number[],
  nasa: number[],
  reference: number[],
): number[] {
  if (values.length === 0 || nasa.length === 0 || reference.length === 0) {
    return [...values];
  }
  const n = Math.min(nasa.length, reference.length);
  const meanX = mean(nasa, n);
  const meanY = mean(reference, n);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = (nasa[i] as number) - meanX;
    num += dx * ((reference[i] as number) - meanY);
    den += dx * dx;
  }
  if (den === 0) {
    const shift = meanY - meanX;
    return values.map((v) => v + shift);
  }
  const b = num / den;
  const a = meanY - b * meanX;
  return values.map((v) => a + b * v);
}

function mean(arr: number[], n: number): number {
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += arr[i] as number;
  return s / n;
}

function stdDev(arr: number[], m: number): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = (arr[i] as number) - m;
    s += d * d;
  }
  return Math.sqrt(s / arr.length);
}
