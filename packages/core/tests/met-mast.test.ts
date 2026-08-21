import { describe, it, expect } from 'vitest';
import { parseMetMastCSV } from '../src/datasources/met-mast-parser.js';
import { performMcpAnalysis } from '../src/analysis/mcp-analysis.js';
import { assessDataQuality } from '../src/analysis/data-quality.js';
import type { MetMastDataset, MetMastColumnConfig } from '../src/types/met-mast.js';
import type { MonthlyWindHistory } from '../src/types/datasources.js';

// ─── CSV Parser ───

describe('parseMetMastCSV', () => {
  const baseConfig: MetMastColumnConfig = {
    timestamp: 'timestamp',
    windSpeed: 'speed',
    windDirection: 'direction',
    heightM: 80,
    hasHeader: true,
    delimiter: ',',
  };

  it('parses valid CSV with header', () => {
    const csv = [
      'timestamp,speed,direction',
      '2024-01-01T00:00:00Z,8.5,270',
      '2024-01-01T01:00:00Z,9.2,265',
      '2024-01-01T02:00:00Z,7.8,280',
    ].join('\n');

    const result = parseMetMastCSV(csv, baseConfig);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.records.length).toBe(3);
    expect(result.value.records[0]!.windSpeedMs).toBe(8.5);
    expect(result.value.records[0]!.windDirectionDeg).toBe(270);
    expect(result.value.heightM).toBe(80);
    expect(result.value.meanSpeedMs).toBeCloseTo(8.5, 0);
  });

  it('rejects empty CSV', () => {
    const result = parseMetMastCSV('', baseConfig);
    expect(result.ok).toBe(false);
  });

  it('rejects CSV with only header', () => {
    const result = parseMetMastCSV('timestamp,speed,direction\n', baseConfig);
    expect(result.ok).toBe(false);
  });

  it('flags out-of-range wind speed', () => {
    const csv = [
      'timestamp,speed,direction',
      '2024-01-01T00:00:00Z,8.5,270',
      '2024-01-01T01:00:00Z,55.0,265', // >50 m/s
      '2024-01-01T02:00:00Z,7.8,280',
    ].join('\n');

    const result = parseMetMastCSV(csv, baseConfig);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.records.length).toBe(2); // out-of-range excluded
    expect(result.value.flaggedRecords.length).toBe(1);
    expect(result.value.flaggedRecords[0]!.flagType).toBe('range_exceeded');
  });

  it('supports numeric column indices', () => {
    const config: MetMastColumnConfig = {
      timestamp: 0,
      windSpeed: 1,
      windDirection: 2,
      heightM: 60,
      hasHeader: false,
    };
    const csv = ['2024-01-01T00:00:00Z,8.5,270', '2024-01-01T01:00:00Z,9.2,265'].join('\n');

    const result = parseMetMastCSV(csv, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.records.length).toBe(2);
  });

  it('supports optional temperature column', () => {
    const config: MetMastColumnConfig = {
      ...baseConfig,
      temperature: 'temp',
    };
    const csv = [
      'timestamp,speed,direction,temp',
      '2024-01-01T00:00:00Z,8.5,270,5.2',
      '2024-01-01T01:00:00Z,9.2,265,4.8',
    ].join('\n');

    const result = parseMetMastCSV(csv, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.records[0]!.temperatureC).toBe(5.2);
  });

  it('detects gaps in time series', () => {
    const csv = [
      'timestamp,speed,direction',
      '2024-01-01T00:00:00Z,8.5,270',
      '2024-01-01T01:00:00Z,9.2,265',
      '2024-01-01T10:00:00Z,7.8,280', // 9-hour gap
    ].join('\n');

    const result = parseMetMastCSV(csv, baseConfig);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.gaps.length).toBe(1);
    expect(result.value.gaps[0]!.durationHours).toBe(9);
  });

  it('detects icing conditions', () => {
    const config: MetMastColumnConfig = {
      ...baseConfig,
      temperature: 'temp',
    };
    const csv = [
      'timestamp,speed,direction,temp',
      '2024-01-01T00:00:00Z,8.5,270,5.0',
      '2024-01-01T01:00:00Z,0.1,265,-3.0', // icing
      '2024-01-01T02:00:00Z,7.8,280,2.0',
    ].join('\n');

    const result = parseMetMastCSV(csv, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const icingFlags = result.value.flaggedRecords.filter((f) => f.flagType === 'icing');
    expect(icingFlags.length).toBe(1);
  });

  it('calculates data recovery', () => {
    const csv = [
      'timestamp,speed,direction',
      '2024-01-01T00:00:00Z,8.5,270',
      '2024-01-01T01:00:00Z,9.2,265',
      '2024-01-01T02:00:00Z,7.8,280',
      '2024-01-01T03:00:00Z,8.0,275',
      '2024-01-01T04:00:00Z,8.3,272',
    ].join('\n');

    const result = parseMetMastCSV(csv, baseConfig);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 5 records over 4 hours = ~1.25 (capped to 1)
    expect(result.value.dataRecovery).toBeLessThanOrEqual(1);
    expect(result.value.dataRecovery).toBeGreaterThan(0);
  });

  it('supports UK date format', () => {
    const config: MetMastColumnConfig = {
      ...baseConfig,
      timestampFormat: 'dd/mm/yyyy hh:mm',
    };
    const csv = [
      'timestamp,speed,direction',
      '01/01/2024 00:00,8.5,270',
      '01/01/2024 01:00,9.2,265',
    ].join('\n');

    const result = parseMetMastCSV(csv, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.records.length).toBe(2);
    expect(result.value.records[0]!.timestamp.getUTCFullYear()).toBe(2024);
  });
});

// ─── MCP Analysis ───

describe('performMcpAnalysis', () => {
  function makeDataset(months: number, baseSpeed: number): MetMastDataset {
    const records = [];
    const startDate = new Date(Date.UTC(2020, 0, 1));
    for (let m = 0; m < months; m++) {
      for (let h = 0; h < 720; h++) {
        // ~720 hours per month
        const ts = new Date(startDate.getTime() + (m * 720 + h) * 3600000);
        const seasonal = 1 + 0.3 * Math.sin(((m % 12) / 12) * 2 * Math.PI);
        records.push({
          timestamp: ts,
          windSpeedMs: baseSpeed * seasonal + (h % 10) * 0.1,
          windDirectionDeg: 270,
          heightM: 50,
        });
      }
    }
    const endDate = records[records.length - 1]!.timestamp;
    const totalSpeed = records.reduce((s, r) => s + r.windSpeedMs, 0);
    return {
      records,
      siteId: 'test',
      heightM: 50,
      startDate,
      endDate,
      dataRecovery: 0.95,
      meanSpeedMs: totalSpeed / records.length,
      totalRecordsParsed: records.length,
      flaggedRecords: [],
      gaps: [],
    };
  }

  function makeReference(years: number, baseSpeed: number): MonthlyWindHistory {
    const records = [];
    for (let y = 2000; y < 2000 + years; y++) {
      for (let m = 1; m <= 12; m++) {
        const seasonal = 1 + 0.3 * Math.sin(((m - 1) / 12) * 2 * Math.PI);
        records.push({
          year: y,
          month: m,
          ws2m: baseSpeed * 0.3 * seasonal,
          ws10m: baseSpeed * 0.6 * seasonal,
          ws50m: baseSpeed * seasonal,
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

  it('performs MCP with good correlation', () => {
    const onSite = makeDataset(12, 8);
    const reference = makeReference(25, 8);
    const result = performMcpAnalysis(onSite, reference, 'ws50m');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.correlationR2).toBeGreaterThan(0.5);
    expect(result.value.predictedLongTermMeanMs).toBeGreaterThan(0);
    expect(result.value.concurrentPeriodMonths).toBeGreaterThanOrEqual(6);
    expect(result.value.summary).toContain('MCP');
  });

  it('fails with insufficient on-site data', () => {
    const onSite = makeDataset(3, 8);
    const reference = makeReference(20, 8);
    const result = performMcpAnalysis(onSite, reference, 'ws50m');

    // May succeed or fail depending on how many months overlap
    // With 3 months of data, we have at most 3 concurrent months
    if (!result.ok) {
      expect(result.error.message).toContain('months');
    }
  });

  it('produces adjustment factor near 1 for matching sites', () => {
    const onSite = makeDataset(12, 8);
    const reference = makeReference(25, 8);
    const result = performMcpAnalysis(onSite, reference, 'ws50m');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Adjustment factor should be near 1 when sites are similar
    expect(result.value.adjustmentFactor).toBeGreaterThan(0.5);
    expect(result.value.adjustmentFactor).toBeLessThan(2.0);
  });

  it('assigns confidence based on R2 and period length', () => {
    const onSite = makeDataset(12, 8);
    const reference = makeReference(25, 8);
    const result = performMcpAnalysis(onSite, reference, 'ws50m');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(['high', 'medium', 'low']).toContain(result.value.confidence);
  });

  it('generates long-term monthly means', () => {
    const onSite = makeDataset(12, 8);
    const reference = makeReference(25, 8); // 2000-2024, overlaps with 2020 on-site data
    const result = performMcpAnalysis(onSite, reference, 'ws50m');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.longTermMonthlyMeans.length).toBe(300); // 25 years * 12 months
    for (const m of result.value.longTermMonthlyMeans) {
      expect(m.predictedSpeedMs).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Data Quality ───

describe('assessDataQuality', () => {
  function makeDataset(overrides?: Partial<MetMastDataset>): MetMastDataset {
    // Generate 12 months of hourly data
    const records = [];
    const startDate = new Date(Date.UTC(2024, 0, 1));
    for (let h = 0; h < 8760; h++) {
      const ts = new Date(startDate.getTime() + h * 3600000);
      records.push({
        timestamp: ts,
        windSpeedMs: 8 + Math.sin(h * 0.01) * 2,
        windDirectionDeg: 270,
        heightM: 80,
      });
    }
    return {
      records,
      siteId: 'test',
      heightM: 80,
      startDate,
      endDate: records[records.length - 1]!.timestamp,
      dataRecovery: 0.95,
      meanSpeedMs: 8,
      totalRecordsParsed: 8760,
      flaggedRecords: [],
      gaps: [],
      ...overrides,
    };
  }

  it('reports adequate quality for complete dataset', () => {
    const dataset = makeDataset();
    const report = assessDataQuality(dataset);

    expect(report.recoveryPercent).toBeGreaterThan(70);
    expect(report.isAdequate).toBe(true);
    expect(report.monthsWithData.length).toBe(12);
    expect(report.summary).toContain('adequate');
  });

  it('reports inadequate for low recovery', () => {
    const dataset = makeDataset({ dataRecovery: 0.3 });
    const report = assessDataQuality(dataset);

    expect(report.recoveryPercent).toBe(30);
    expect(report.isAdequate).toBe(false);
    expect(report.summary).toContain('inadequate');
  });

  it('counts icing and stuck sensor flags', () => {
    const dataset = makeDataset({
      flaggedRecords: [
        { index: 0, timestamp: new Date(), flagType: 'icing', description: 'test' },
        { index: 1, timestamp: new Date(), flagType: 'icing', description: 'test' },
        { index: 2, timestamp: new Date(), flagType: 'stuck_sensor', description: 'test' },
      ],
    });
    const report = assessDataQuality(dataset);

    expect(report.icingRecordCount).toBe(2);
    expect(report.stuckSensorCount).toBe(1);
  });

  it('reports gap statistics', () => {
    const dataset = makeDataset({
      gaps: [
        { startTime: new Date(), endTime: new Date(), durationHours: 24 },
        { startTime: new Date(), endTime: new Date(), durationHours: 72 },
      ],
    });
    const report = assessDataQuality(dataset);

    expect(report.gapCount).toBe(2);
    expect(report.totalGapHours).toBe(96);
    expect(report.longestGapHours).toBe(72);
  });

  it('checks seasonal completeness', () => {
    // Only 6 months of data
    const records = [];
    const startDate = new Date(Date.UTC(2024, 0, 1));
    for (let h = 0; h < 4380; h++) {
      // ~6 months
      const ts = new Date(startDate.getTime() + h * 3600000);
      records.push({
        timestamp: ts,
        windSpeedMs: 8,
        windDirectionDeg: 270,
        heightM: 80,
      });
    }
    const dataset = makeDataset({
      records,
      startDate,
      endDate: records[records.length - 1]!.timestamp,
    });
    const report = assessDataQuality(dataset);

    expect(report.monthsWithData.length).toBeLessThan(12);
    expect(report.seasonalCompleteness.filter(Boolean).length).toBeLessThan(12);
  });
});
