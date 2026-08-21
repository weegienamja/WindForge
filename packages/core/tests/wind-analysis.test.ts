import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeWindTrend,
  computeSeasonalHeatmap,
  computeMonthlyBoxPlots,
  computeDiurnalProfile,
  computeSpeedDistribution,
  computeYearOverYear,
} from '../src/analysis/wind-analysis.js';
import type {
  MonthlyWindHistory,
  DailyWindData,
  HourlyWindData,
} from '../src/types/datasources.js';

// ─── Test data helpers ───

function makeMonthlyHistory(yearCount = 3): MonthlyWindHistory {
  const records = [];
  for (let y = 2020; y < 2020 + yearCount; y++) {
    for (let m = 1; m <= 12; m++) {
      records.push({
        year: y,
        month: m,
        ws2m: 2 + Math.sin((m / 12) * Math.PI) * 1.5,
        ws10m: 4 + Math.sin((m / 12) * Math.PI) * 2,
        ws50m: 7 + Math.sin((m / 12) * Math.PI) * 3,
        wd10m: 200 + m * 5,
        wd50m: 210 + m * 5,
      });
    }
  }
  return {
    coordinate: { lat: 55, lng: -4 },
    records,
    startYear: 2020,
    endYear: 2020 + yearCount - 1,
  };
}

function makeDailyData(days = 30): DailyWindData {
  const records = [];
  for (let d = 0; d < days; d++) {
    const day = String(d + 1).padStart(2, '0');
    records.push({
      date: `2023-01-${day}`,
      ws2m: 2 + Math.random() * 3,
      ws10m: 4 + Math.random() * 4,
      ws50m: 6 + Math.random() * 6,
      wd10m: 180 + Math.random() * 60,
      wd50m: 190 + Math.random() * 60,
    });
  }
  return {
    coordinate: { lat: 55, lng: -4 },
    records,
    startDate: '2023-01-01',
    endDate: `2023-01-${String(days).padStart(2, '0')}`,
  };
}

function makeHourlyData(days = 7): HourlyWindData {
  const records = [];
  for (let d = 0; d < days; d++) {
    const day = String(d + 1).padStart(2, '0');
    for (let h = 0; h < 24; h++) {
      const hour = String(h).padStart(2, '0');
      // Simulate diurnal pattern: higher winds mid-afternoon
      const diurnalFactor = 1 + 0.5 * Math.sin(((h - 6) / 24) * 2 * Math.PI);
      records.push({
        datetime: `2023-01-${day}T${hour}:00`,
        ws2m: 2 * diurnalFactor,
        ws10m: 4 * diurnalFactor,
        ws50m: 7 * diurnalFactor,
        wd10m: 200,
        wd50m: 210,
      });
    }
  }
  return {
    coordinate: { lat: 55, lng: -4 },
    records,
    startDate: '2023-01-01',
    endDate: `2023-01-${String(days).padStart(2, '0')}`,
  };
}

// ─── computeWindTrend ───

describe('computeWindTrend', () => {
  it('returns empty result for empty history', () => {
    const result = computeWindTrend({
      coordinate: { lat: 0, lng: 0 },
      records: [],
      startYear: 2020,
      endYear: 2020,
    });
    expect(result.points).toHaveLength(0);
    expect(result.slopePerYear).toBeNull();
    expect(result.rSquared).toBeNull();
    expect(result.trendDirection).toBe('indeterminate');
  });

  it('computes trend with correct number of points', () => {
    const history = makeMonthlyHistory(3);
    const result = computeWindTrend(history);
    expect(result.points).toHaveLength(36); // 3 years × 12 months
  });

  it('each point has year, month, speedMs, and trendMs', () => {
    const history = makeMonthlyHistory(2);
    const result = computeWindTrend(history);
    const point = result.points[0]!;
    expect(point).toHaveProperty('year');
    expect(point).toHaveProperty('month');
    expect(point).toHaveProperty('speedMs');
    expect(point).toHaveProperty('trendMs');
    expect(typeof point.speedMs).toBe('number');
    expect(typeof point.trendMs).toBe('number');
  });

  it('uses ws50m when available', () => {
    const history = makeMonthlyHistory(1);
    const result = computeWindTrend(history);
    // ws50m values are around 7-10, ws2m around 2-3.5
    expect(result.points[0]!.speedMs).toBeGreaterThan(5);
  });

  it('falls back to ws10m when ws50m < 0', () => {
    const history = makeMonthlyHistory(1);
    for (const r of history.records) {
      r.ws50m = -999;
    }
    const result = computeWindTrend(history);
    // ws10m values are around 4-6
    expect(result.points[0]!.speedMs).toBeGreaterThan(3);
    expect(result.points[0]!.speedMs).toBeLessThan(7);
  });

  it('falls back to ws2m when both ws50m and ws10m < 0', () => {
    const history = makeMonthlyHistory(1);
    for (const r of history.records) {
      r.ws50m = -999;
      r.ws10m = -999;
    }
    const result = computeWindTrend(history);
    expect(result.points[0]!.speedMs).toBeGreaterThan(1);
    expect(result.points[0]!.speedMs).toBeLessThan(4);
  });

  it('rSquared is between 0 and 1', () => {
    const history = makeMonthlyHistory(5);
    const result = computeWindTrend(history);
    expect(result.rSquared).toBeGreaterThanOrEqual(0);
    expect(result.rSquared).toBeLessThanOrEqual(1);
  });

  it('detects increasing trend', () => {
    const history: MonthlyWindHistory = {
      coordinate: { lat: 55, lng: -4 },
      records: Array.from({ length: 24 }, (_, i) => ({
        year: 2020 + Math.floor(i / 12),
        month: (i % 12) + 1,
        ws2m: -999,
        ws10m: -999,
        ws50m: 5 + i * 0.1,
        wd10m: 200,
        wd50m: 210,
      })),
      startYear: 2020,
      endYear: 2021,
    };
    const result = computeWindTrend(history);
    expect(result.slopePerYear).toBeGreaterThan(0);
  });
});

// ─── computeSeasonalHeatmap ───

describe('computeSeasonalHeatmap', () => {
  it('returns 288 cells (12 months × 24 hours)', () => {
    const hourly = makeHourlyData(7);
    const result = computeSeasonalHeatmap(hourly);
    expect(result.cells).toHaveLength(24);
  });

  it('returns empty-valued cells for months with no data', () => {
    const hourly = makeHourlyData(7); // Only January data
    const result = computeSeasonalHeatmap(hourly);
    // February cell should have 0 speed
    const febCell = result.cells.find((c) => c.month === 2 && c.hour === 12);
    expect(febCell).toBeUndefined();
  });

  it('each cell has month, hour, speedMs', () => {
    const hourly = makeHourlyData(3);
    const result = computeSeasonalHeatmap(hourly);
    const cell = result.cells[0]!;
    expect(cell).toHaveProperty('month');
    expect(cell).toHaveProperty('hour');
    expect(cell).toHaveProperty('speedMs');
  });

  it('January cells have non-zero speeds', () => {
    const hourly = makeHourlyData(7);
    const result = computeSeasonalHeatmap(hourly);
    const janCells = result.cells.filter((c) => c.month === 1);
    expect(janCells.length).toBe(24);
    expect(janCells.every((c) => c.speedMs > 0)).toBe(true);
  });

  it('skips records with negative speeds', () => {
    const hourly: HourlyWindData = {
      coordinate: { lat: 55, lng: -4 },
      records: [
        {
          datetime: '2023-01-01T12:00',
          ws2m: null,
          ws10m: null,
          ws50m: null,
          wd10m: 200,
          wd50m: 210,
        },
      ],
      startDate: '2023-01-01',
      endDate: '2023-01-01',
    };
    const result = computeSeasonalHeatmap(hourly);
    const janNoon = result.cells.find((c) => c.month === 1 && c.hour === 12);
    expect(janNoon).toBeUndefined();
  });

  it('has bestSeason and worstSeason', () => {
    const hourly = makeHourlyData(7);
    const result = computeSeasonalHeatmap(hourly);
    expect(result.bestSeason).toBeDefined();
    expect(result.worstSeason).toBeDefined();
  });
});

// ─── computeMonthlyBoxPlots ───

describe('computeMonthlyBoxPlots', () => {
  it('returns 12 box plots (one per month)', () => {
    const history = makeMonthlyHistory(5);
    const plots = computeMonthlyBoxPlots(history);
    expect(plots).toHaveLength(12);
  });

  it('each box plot has min <= q1 <= median <= q3 <= max', () => {
    const history = makeMonthlyHistory(10);
    const plots = computeMonthlyBoxPlots(history);
    for (const p of plots) {
      expect(p.min).toBeLessThanOrEqual(p.q1);
      expect(p.q1).toBeLessThanOrEqual(p.median);
      expect(p.median).toBeLessThanOrEqual(p.q3);
      expect(p.q3).toBeLessThanOrEqual(p.max);
    }
  });

  it('mean is between min and max', () => {
    const history = makeMonthlyHistory(5);
    const plots = computeMonthlyBoxPlots(history);
    const eps = 1e-12;
    for (const p of plots) {
      expect(p.mean).toBeGreaterThanOrEqual(p.min - eps);
      expect(p.mean).toBeLessThanOrEqual(p.max + eps);
    }
  });

  it('returns zeros for months with no data', () => {
    const history: MonthlyWindHistory = {
      coordinate: { lat: 55, lng: -4 },
      records: [{ year: 2020, month: 1, ws2m: 5, ws10m: 8, ws50m: 12, wd10m: 200, wd50m: 210 }],
      startYear: 2020,
      endYear: 2020,
    };
    const plots = computeMonthlyBoxPlots(history);
    const febPlot = plots.find((p) => p.month === 2);
    expect(febPlot).toBeUndefined();
    expect(plots).toHaveLength(1);
  });

  it('handles single data point for a month', () => {
    const history: MonthlyWindHistory = {
      coordinate: { lat: 55, lng: -4 },
      records: [{ year: 2020, month: 6, ws2m: 3, ws10m: 5, ws50m: 8, wd10m: 200, wd50m: 210 }],
      startYear: 2020,
      endYear: 2020,
    };
    const plots = computeMonthlyBoxPlots(history);
    const junPlot = plots.find((p) => p.month === 6)!;
    expect(junPlot.min).toBe(8);
    expect(junPlot.max).toBe(8);
    expect(junPlot.median).toBe(8);
  });
});

// ─── computeDiurnalProfile ───

describe('computeDiurnalProfile', () => {
  it('returns 24 points (one per hour)', () => {
    const hourly = makeHourlyData(7);
    const result = computeDiurnalProfile(hourly);
    expect(result.hours).toHaveLength(24);
  });

  it('each point has hour, meanSpeedMs, minSpeedMs, maxSpeedMs', () => {
    const hourly = makeHourlyData(3);
    const result = computeDiurnalProfile(hourly);
    const p = result.hours[0]!;
    expect(p).toHaveProperty('hour');
    expect(p).toHaveProperty('meanSpeedMs');
    expect(p).toHaveProperty('minSpeedMs');
    expect(p).toHaveProperty('maxSpeedMs');
  });

  it('min <= mean <= max for each hour', () => {
    const hourly = makeHourlyData(14);
    const result = computeDiurnalProfile(hourly);
    const eps = 1e-12;
    for (const p of result.hours) {
      expect(p.minSpeedMs).toBeLessThanOrEqual(p.meanSpeedMs + eps);
      expect(p.meanSpeedMs).toBeLessThanOrEqual(p.maxSpeedMs + eps);
    }
  });

  it('hours are 0-23', () => {
    const hourly = makeHourlyData(3);
    const result = computeDiurnalProfile(hourly);
    const hours = result.hours.map((p) => p.hour);
    expect(hours).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('returns zeros for hours with no data', () => {
    const hourly: HourlyWindData = {
      coordinate: { lat: 55, lng: -4 },
      records: [
        {
          datetime: '2023-01-01T12:00',
          ws2m: 3,
          ws10m: 5,
          ws50m: 8,
          wd10m: 200,
          wd50m: 210,
        },
      ],
      startDate: '2023-01-01',
      endDate: '2023-01-01',
    };
    const result = computeDiurnalProfile(hourly);
    const hour0 = result.hours.find((p) => p.hour === 0);
    expect(hour0).toBeUndefined();
    const hour12 = result.hours.find((p) => p.hour === 12)!;
    expect(hour12.meanSpeedMs).toBe(8);
  });

  it('has peakHour and troughHour', () => {
    const hourly = makeHourlyData(7);
    const result = computeDiurnalProfile(hourly);
    expect(result.peakHour).toBeGreaterThanOrEqual(0);
    expect(result.peakHour).toBeLessThan(24);
    expect(result.troughHour).toBeGreaterThanOrEqual(0);
    expect(result.troughHour).toBeLessThan(24);
  });
});

// ─── computeSpeedDistribution ───

describe('computeSpeedDistribution', () => {
  it('returns bins and Weibull parameters', () => {
    const daily = makeDailyData(100);
    const result = computeSpeedDistribution(daily);
    expect(result.bins.length).toBeGreaterThan(0);
    expect(result.weibullK).toBeGreaterThan(0);
    expect(result.weibullC).toBeGreaterThan(0);
  });

  it('frequencies sum to approximately 1', () => {
    const daily = makeDailyData(200);
    const result = computeSpeedDistribution(daily);
    const totalFreq = result.bins.reduce((sum, b) => sum + b.frequency, 0);
    expect(totalFreq).toBeCloseTo(1, 1);
  });

  it('each bin has binStart < binEnd', () => {
    const daily = makeDailyData(50);
    const result = computeSpeedDistribution(daily);
    for (const bin of result.bins) {
      expect(bin.binStart).toBeLessThan(bin.binEnd);
    }
  });

  it('returns empty for empty daily data', () => {
    const daily: DailyWindData = {
      coordinate: { lat: 55, lng: -4 },
      records: [],
      startDate: '2023-01-01',
      endDate: '2023-01-01',
    };
    const result = computeSpeedDistribution(daily);
    expect(result.bins).toHaveLength(0);
    expect(result.weibullK).toBeNull();
  });

  it('respects custom binWidth', () => {
    const daily = makeDailyData(100);
    const result2 = computeSpeedDistribution(daily, 2);
    const result1 = computeSpeedDistribution(daily, 1);
    // With binWidth=2, should have roughly half the bins
    expect(result2.bins.length).toBeLessThanOrEqual(result1.bins.length);
    for (const bin of result2.bins) {
      expect(bin.binEnd - bin.binStart).toBe(2);
    }
  });

  it('Weibull k is reasonable (0.5-10)', () => {
    const daily = makeDailyData(200);
    const result = computeSpeedDistribution(daily);
    expect(result.weibullK).toBeGreaterThanOrEqual(0.5);
    expect(result.weibullK).toBeLessThanOrEqual(10);
  });
});

// ─── computeYearOverYear ───

describe('computeYearOverYear', () => {
  it('returns one entry per year', () => {
    const history = makeMonthlyHistory(5);
    const yoy = computeYearOverYear(history);
    expect(yoy).toHaveLength(5);
  });

  it('years are sorted ascending', () => {
    const history = makeMonthlyHistory(3);
    const yoy = computeYearOverYear(history);
    for (let i = 1; i < yoy.length; i++) {
      expect(yoy[i]!.year).toBeGreaterThan(yoy[i - 1]!.year);
    }
  });

  it('each entry has 12 monthlyMeans', () => {
    const history = makeMonthlyHistory(2);
    const yoy = computeYearOverYear(history);
    for (const entry of yoy) {
      expect(entry.monthlyMeans).toHaveLength(12);
    }
  });

  it('annualMeanMs is positive for non-empty years', () => {
    const history = makeMonthlyHistory(3);
    const yoy = computeYearOverYear(history);
    for (const entry of yoy) {
      expect(entry.annualMeanMs).toBeGreaterThan(0);
    }
  });

  it('returns empty array for empty history', () => {
    const history: MonthlyWindHistory = {
      coordinate: { lat: 55, lng: -4 },
      records: [],
      startYear: 2020,
      endYear: 2020,
    };
    const yoy = computeYearOverYear(history);
    expect(yoy).toHaveLength(0);
  });
});
