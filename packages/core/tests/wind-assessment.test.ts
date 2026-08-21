import { describe, it, expect } from 'vitest';
import {
  estimateTurbulenceIntensity,
  classifyTurbulence,
  estimateExtremeWind,
  fitGumbel,
  gumbelQuantile,
} from '../src/index.js';
import type {
  HourlyWindData,
  DailyWindData,
  MonthlyWindHistory,
} from '../src/types/datasources.js';

// ─── Turbulence Intensity ───

describe('classifyTurbulence', () => {
  it('classifies low turbulence as Class C', () => {
    expect(classifyTurbulence(0.1)).toBe('C');
  });

  it('classifies medium turbulence as Class B', () => {
    expect(classifyTurbulence(0.13)).toBe('B');
  });

  it('classifies high turbulence as Class A', () => {
    expect(classifyTurbulence(0.15)).toBe('A');
  });

  it('classifies very high turbulence as exceeds_A', () => {
    expect(classifyTurbulence(0.2)).toBe('exceeds_A');
  });

  it('classifies boundary values correctly', () => {
    expect(classifyTurbulence(0.12)).toBe('C'); // at boundary, <= 0.12 is C
    expect(classifyTurbulence(0.14)).toBe('B'); // at boundary, <= 0.14 is B
    expect(classifyTurbulence(0.16)).toBe('A'); // at boundary, <= 0.16 is A
  });
});

describe('estimateTurbulenceIntensity - hourly data', () => {
  function makeHourlyData(speeds: number[]): HourlyWindData {
    return {
      coordinate: { lat: 55, lng: -3 },
      records: speeds.map((s, i) => ({
        datetime: `2024-01-01T${String(i % 24).padStart(2, '0')}:00`,
        ws2m: s * 0.4,
        ws10m: s * 0.7,
        ws50m: s,
        wd10m: 270,
        wd50m: 270,
      })),
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    };
  }

  it('computes an explicitly limited variability proxy from hourly means', () => {
    // Create data with known variability: speeds around 10 m/s with some spread
    const speeds: number[] = [];
    for (let i = 0; i < 100; i++) {
      speeds.push(10 + Math.sin(i * 0.5) * 2); // varies between 8-12
    }
    const data = makeHourlyData(speeds);
    const result = estimateTurbulenceIntensity(data, 'ws50m');

    expect(result.meanTi).toBeGreaterThan(0);
    expect(result.meanTi).toBeLessThan(0.5);
    expect(result.tiBins.length).toBeGreaterThan(0);
    expect(result.dataSource).toBe('hourly');
    expect(result.assessmentLevel).toBe('variability_proxy');
    expect(result.referenceCategory).toBeNull();
    expect(result.summary).toContain('Hourly variability proxy');
    expect(result.limitation).toContain('do not resolve');
  });

  it('returns empty result for insufficient data', () => {
    const data = makeHourlyData([5, 6, 7]);
    const result = estimateTurbulenceIntensity(data, 'ws50m');
    expect(result.meanTi).toBeNull();
    expect(result.summary).toContain('Insufficient');
  });

  it('each bin has valid fields', () => {
    const speeds: number[] = [];
    for (let i = 0; i < 200; i++) {
      speeds.push(5 + Math.random() * 15);
    }
    const data = makeHourlyData(speeds);
    const result = estimateTurbulenceIntensity(data, 'ws50m');

    for (const bin of result.tiBins) {
      expect(bin.speedBinMs).toBeGreaterThanOrEqual(1);
      expect(bin.ti).toBeGreaterThanOrEqual(0);
      expect(bin.ti).toBeLessThanOrEqual(1);
      expect(bin.count).toBeGreaterThan(0);
    }
  });

  it('does not assign an IEC class from hourly mean data', () => {
    // Very steady wind (low TI)
    const steadySpeeds = Array.from({ length: 200 }, () => 15);
    const data = makeHourlyData(steadySpeeds);
    const result = estimateTurbulenceIntensity(data, 'ws50m');
    expect(result.referenceCategory).toBeNull();
  });
});

describe('estimateTurbulenceIntensity - daily data', () => {
  function makeDailyData(speeds: number[]): DailyWindData {
    return {
      coordinate: { lat: 55, lng: -3 },
      records: speeds.map((s, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        ws2m: s * 0.4,
        ws10m: s * 0.7,
        ws50m: s,
        wd10m: 270,
        wd50m: 270,
      })),
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    };
  }

  it('rejects daily mean data as unsuitable for turbulence assessment', () => {
    const speeds: number[] = [];
    for (let i = 0; i < 30; i++) {
      speeds.push(8 + Math.sin(i * 0.3) * 3);
    }
    const data = makeDailyData(speeds);
    const result = estimateTurbulenceIntensity(data, 'ws50m');

    expect(result.meanTi).toBeNull();
    expect(result.dataSource).toBe('daily_unsupported');
    expect(result.assessmentLevel).toBe('unsupported');
    expect(result.summary).toContain('unsuitable');
  });
});

// ─── Gumbel Distribution ───

describe('fitGumbel', () => {
  it('fits known data correctly', () => {
    // Known annual maxima
    const values = [25, 28, 22, 30, 26, 24, 27, 29, 23, 31];
    const { mu, sigma } = fitGumbel(values);

    expect(mu).toBeGreaterThan(20);
    expect(mu).toBeLessThan(30);
    expect(sigma).toBeGreaterThan(0);
    expect(sigma).toBeLessThan(10);
  });

  it('handles single value', () => {
    const { mu, sigma } = fitGumbel([20]);
    expect(mu).toBeGreaterThanOrEqual(0);
    expect(sigma).toBeGreaterThan(0); // minimum enforced
  });

  it('handles constant values', () => {
    const { mu, sigma } = fitGumbel([10, 10, 10, 10, 10]);
    // With zero variance, sigma should be minimum value
    expect(mu).toBeCloseTo(10, 0);
    expect(sigma).toBeCloseTo(0.01, 1); // clamped minimum
  });
});

describe('gumbelQuantile', () => {
  it('returns higher values for longer return periods', () => {
    const v2 = gumbelQuantile(20, 3, 2);
    const v10 = gumbelQuantile(20, 3, 10);
    const v50 = gumbelQuantile(20, 3, 50);

    expect(v10).toBeGreaterThan(v2);
    expect(v50).toBeGreaterThan(v10);
  });

  it('returns mu at return period ~1.58 (mode)', () => {
    // At the mode of the Gumbel distribution
    // F(mu) = exp(-exp(0)) = exp(-1) ≈ 0.368, so T = 1/(1-0.368) ≈ 1.58
    const v = gumbelQuantile(20, 3, 1 / (1 - Math.exp(-1)));
    expect(v).toBeCloseTo(20, 0);
  });

  it('rejects the undefined one-year return period', () => {
    expect(() => gumbelQuantile(20, 3, 1)).toThrow(RangeError);
  });

  it('is sensitive to sigma', () => {
    const narrow = gumbelQuantile(20, 1, 50);
    const wide = gumbelQuantile(20, 5, 50);
    expect(wide).toBeGreaterThan(narrow);
  });
});

// ─── Extreme Wind Estimation ───

describe('estimateExtremeWind', () => {
  function makeMonthlyHistory(years: number, peakSpeed: number): MonthlyWindHistory {
    const records = [];
    for (let y = 2000; y < 2000 + years; y++) {
      for (let m = 1; m <= 12; m++) {
        // Simulate seasonal variation: windier in winter
        const seasonal = m <= 3 || m >= 10 ? 1.3 : 0.8;
        const yearRandom = 0.9 + (y % 5) * 0.05; // some year-to-year variation
        const base = peakSpeed * seasonal * yearRandom;
        records.push({
          year: y,
          month: m,
          ws2m: base * 0.3,
          ws10m: base * 0.6,
          ws50m: base,
          wd10m: 270,
          wd50m: 270,
        });
      }
    }
    return {
      coordinate: { lat: 55, lng: -3 },
      records,
      startYear: 2000,
      endYear: 2000 + years - 1,
    };
  }

  it('estimates a coarse return level from monthly history', () => {
    const history = makeMonthlyHistory(20, 12);
    const result = estimateExtremeWind(history, 'ws50m');

    expect(result.v50YearMs).toBeGreaterThan(10);
    expect(result.v1YearMs).toBeNull();
    expect(result.annualMaxima.length).toBe(20);
    expect(result.referenceHeightM).toBe(50);
  });

  it('does not assign an IEC wind class from monthly mean data', () => {
    const history = makeMonthlyHistory(20, 12);
    const result = estimateExtremeWind(history, 'ws50m');
    expect(result.referenceCategory).toBeNull();
    expect(result.assessmentLevel).toBe('coarse_return_level');
  });

  it('returns low confidence for monthly data', () => {
    const history = makeMonthlyHistory(20, 10);
    const result = estimateExtremeWind(history, 'ws50m');
    // Monthly data always has at most medium confidence for extremes
    expect(['medium', 'low']).toContain(result.confidence);
  });

  it('returns insufficient data for short records', () => {
    const history = makeMonthlyHistory(3, 10);
    const result = estimateExtremeWind(history, 'ws50m');
    expect(result.v50YearMs).toBeNull();
    expect(result.summary).toContain('Insufficient');
    expect(result.confidence).toBe('low');
  });

  it('generates meaningful summary', () => {
    const history = makeMonthlyHistory(20, 12);
    const result = estimateExtremeWind(history, 'ws50m');
    expect(result.summary).toContain('50-year return level');
    expect(result.summary).toContain('No IEC turbine class');
    expect(result.summary).toContain('20 years');
  });

  it('works with ws10m height key', () => {
    const history = makeMonthlyHistory(15, 8);
    const result = estimateExtremeWind(history, 'ws10m');
    expect(result.referenceHeightM).toBe(10);
    expect(result.v50YearMs).toBeGreaterThan(0);
  });

  it('extracts correct annual maxima', () => {
    const history = makeMonthlyHistory(10, 10);
    const result = estimateExtremeWind(history, 'ws50m');
    // Each year should have exactly one maximum
    expect(result.annualMaxima.length).toBe(10);
    for (const am of result.annualMaxima) {
      expect(am.maxSpeedMs).toBeGreaterThan(0);
      expect(am.year).toBeGreaterThanOrEqual(2000);
    }
  });
});
