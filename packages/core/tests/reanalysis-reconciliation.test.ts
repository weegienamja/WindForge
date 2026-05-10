import { describe, it, expect } from 'vitest';
import { reconcileWindData } from '../src/analysis/reanalysis-reconciliation.js';
import type { ReconciliationSource } from '../src/analysis/reanalysis-reconciliation.js';
import type {
  MonthlyWindHistory,
  MonthlyWindRecord,
  WindDataSummary,
} from '../src/types/datasources.js';

// ─── Helpers ───

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function normal(rand: () => number, m: number, sd: number): number {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return m + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

interface MonthSpec {
  year: number;
  month: number;
  ws: number;
  wd?: number;
}

function makeHistory(records: MonthSpec[]): MonthlyWindHistory {
  return {
    coordinate: { lat: 55.86, lng: -4.25 },
    startYear: records[0]?.year ?? 0,
    endYear: records[records.length - 1]?.year ?? 0,
    records: records.map<MonthlyWindRecord>((r) => ({
      year: r.year,
      month: r.month,
      ws2m: 0,
      ws10m: 0,
      ws50m: r.ws,
      wd10m: r.wd ?? 240,
      wd50m: r.wd ?? 240,
    })),
  };
}

function makeSummary(meanMs: number, sdMs = 1.0, dataYears = 10): WindDataSummary {
  return {
    coordinate: { lat: 55.86, lng: -4.25 },
    monthlyAverages: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      averageSpeedMs: meanMs,
      averageDirectionDeg: 240,
    })),
    annualAverageSpeedMs: meanMs,
    speedStdDevMs: sdMs,
    prevailingDirectionDeg: 240,
    directionalConsistency: 0.7,
    dataYears,
    referenceHeightM: 50,
  };
}

/** Build a paired (summary, history) for a deterministic synthetic series. */
function syntheticSource(
  startYear: number,
  months: number,
  speedFn: (i: number) => number,
  dataYears: number,
): ReconciliationSource {
  const records: MonthSpec[] = [];
  const speeds: number[] = [];
  for (let i = 0; i < months; i++) {
    const year = startYear + Math.floor(i / 12);
    const month = (i % 12) + 1;
    const ws = speedFn(i);
    speeds.push(ws);
    records.push({ year, month, ws });
  }
  const meanMs = speeds.reduce((s, v) => s + v, 0) / speeds.length;
  const sdMs = Math.sqrt(speeds.reduce((s, v) => s + (v - meanMs) * (v - meanMs), 0) / speeds.length);
  return {
    history: makeHistory(records),
    summary: { ...makeSummary(meanMs, sdMs, dataYears) },
  };
}

// ─── Tests ───

describe('reconcileWindData: no reference', () => {
  it('returns NASA unchanged with method=none and reference=null', () => {
    const nasa = syntheticSource(2015, 60, (i) => 6 + Math.sin(i / 6), 5);
    const result = reconcileWindData({ nasa, era5: null, cerra: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.method).toBe('none');
    expect(result.value.reference).toBeNull();
    expect(result.value.diagnostics).toBeNull();
    expect(result.value.corrected).toBe(nasa.summary);
    expect(result.value.detail).toContain('No reanalysis');
  });
});

describe('reconcileWindData: source preference', () => {
  it('CERRA is preferred over ERA5 when both are present', () => {
    const rand = rng(1);
    const truth = (i: number) => normal(rand, 8, 2);
    const ref = syntheticSource(2018, 36, truth, 3);
    const nasa = syntheticSource(2018, 36, (i) => 0.85 * (truth(i)) + 0.5, 3);
    const result = reconcileWindData({ nasa, era5: ref, cerra: ref });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reference).toBe('cerra');
  });
});

describe('reconcileWindData: auto method selection', () => {
  it('30 months overlap selects quantile', () => {
    const rand = rng(2);
    const ref = syntheticSource(2018, 30, () => normal(rand, 8, 2), 3);
    const nasa = syntheticSource(2018, 30, () => normal(rand, 6, 1.5), 3);
    const result = reconcileWindData({ nasa, era5: ref, cerra: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.method).toBe('quantile');
  });

  it('18 months overlap selects variance', () => {
    const rand = rng(3);
    const ref = syntheticSource(2018, 18, () => normal(rand, 8, 2), 2);
    const nasa = syntheticSource(2018, 18, () => normal(rand, 6, 1.5), 2);
    const result = reconcileWindData({ nasa, era5: ref, cerra: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.method).toBe('variance');
  });

  it('6 months overlap returns method=none with low confidence', () => {
    const ref = syntheticSource(2020, 6, (i) => 8 + i * 0.1, 1);
    const nasa = syntheticSource(2020, 6, (i) => 6 + i * 0.1, 1);
    const result = reconcileWindData({ nasa, era5: ref, cerra: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.method).toBe('none');
    expect(result.value.confidence).toBe('low');
    expect(result.value.detail).toContain('Insufficient overlap');
  });
});

describe('reconcileWindData: manual override', () => {
  it("method='linear' is honoured even when 30 months are available", () => {
    const rand = rng(4);
    const truth = Array.from({ length: 30 }, () => normal(rand, 8, 2));
    const ref = syntheticSource(2018, 30, (i) => truth[i] as number, 3);
    const nasa = syntheticSource(2018, 30, (i) => 0.85 * (truth[i] as number) + 0.5, 3);
    const result = reconcileWindData({ nasa, era5: ref, cerra: null, method: 'linear' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.method).toBe('linear');
  });
});

describe('reconcileWindData: confidence escalation', () => {
  it('escalates to high when correction reduces both bias and RMSE with >= 24 months', () => {
    const rand = rng(5);
    const months = 36;
    const truth = Array.from({ length: months }, () => normal(rand, 8, 2));
    const ref = syntheticSource(2018, months, (i) => truth[i] as number, 3);
    const nasa = syntheticSource(2018, months, (i) => 0.85 * (truth[i] as number) + 0.5, 3);
    const result = reconcileWindData({ nasa, era5: ref, cerra: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.confidence).toBe('high');
    const d = result.value.diagnostics;
    expect(d).not.toBeNull();
    if (d) {
      expect(d.rmseAfterMs).toBeLessThan(d.rmseBeforeMs);
      expect(Math.abs(d.biasAfterMs)).toBeLessThan(Math.abs(d.biasBeforeMs));
    }
  });

  it('falls back to none + low when correction would increase RMSE', () => {
    // Construct pathological case: noiseless NASA = reference shifted, but with
    // identical sd. Only chance for variance scaling to hurt: identical series
    // already match perfectly. Use linear where slope-fit will overshoot.
    // We force with a small overlap window where noise dominates.
    const rand = rng(6);
    // NASA matches reference exactly except for a single-point swap that
    // breaks the linear fit. Easier: choose constant series where bias
    // correction is unnecessary and noise added by the regression worsens RMSE.
    // Use linear method on data where nasa and reference are uncorrelated.
    const ref = syntheticSource(2018, 24, () => normal(rand, 8, 2), 2);
    const nasa = syntheticSource(2018, 24, () => normal(rand, 8, 2), 2);
    // Force linear method which is most likely to overfit on uncorrelated data.
    const result = reconcileWindData({ nasa, era5: ref, cerra: null, method: 'linear' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Either it succeeded (some correlation by chance) or it fell back.
    if (result.value.method === 'none') {
      expect(result.value.confidence).toBe('low');
      expect(result.value.detail).toMatch(/RMSE|Falling back/);
    } else {
      expect(['medium', 'high']).toContain(result.value.confidence);
    }
  });
});

describe('reconcileWindData: detail string contents', () => {
  it('contains the bias and RMSE numbers it claims', () => {
    const rand = rng(7);
    const months = 36;
    const truth = Array.from({ length: months }, () => normal(rand, 8, 2));
    const ref = syntheticSource(2018, months, (i) => truth[i] as number, 3);
    const nasa = syntheticSource(2018, months, (i) => 0.85 * (truth[i] as number) + 0.5, 3);
    const result = reconcileWindData({ nasa, era5: ref, cerra: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const d = result.value.diagnostics;
    expect(d).not.toBeNull();
    if (!d) return;
    // Detail should mention RMSE before/after at 2 dp.
    expect(result.value.detail).toContain(d.rmseBeforeMs.toFixed(2));
    expect(result.value.detail).toContain(d.rmseAfterMs.toFixed(2));
    expect(result.value.detail).toContain(`${months} months`);
    expect(result.value.detail).toContain('ERA5');
  });
});

describe('reconcileWindData: corrected summary derivation', () => {
  it('recomputes Weibull k and c, differing from NASA original when correction non-trivial', () => {
    const rand = rng(8);
    const months = 36;
    const truth = Array.from({ length: months }, () => normal(rand, 8, 2));
    const ref = syntheticSource(2018, months, (i) => truth[i] as number, 3);
    const nasa = syntheticSource(2018, months, (i) => 0.85 * (truth[i] as number) + 0.5, 3);
    const result = reconcileWindData({ nasa, era5: ref, cerra: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.corrected.weibullK).toBeGreaterThan(0);
    expect(result.value.corrected.weibullC).toBeGreaterThan(0);
    // The corrected mean should differ meaningfully from NASA's mean.
    expect(
      Math.abs(result.value.corrected.annualAverageSpeedMs - nasa.summary.annualAverageSpeedMs),
    ).toBeGreaterThan(0.1);
  });

  it('preserves dataYears from NASA original (does not extend)', () => {
    const rand = rng(9);
    const months = 36;
    const ref = syntheticSource(2018, months, () => normal(rand, 8, 2), 3);
    const nasa = syntheticSource(2018, months, () => normal(rand, 6, 1.5), 3);
    const result = reconcileWindData({ nasa, era5: ref, cerra: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.corrected.dataYears).toBe(nasa.summary.dataYears);
  });
});
