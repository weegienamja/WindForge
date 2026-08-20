import { describe, expect, it } from 'vitest';
import { WindForgeDB, type CellRecord } from '../scripts/lib/heatmap-store';

const record = (over: Partial<CellRecord> = {}): CellRecord => ({
  id: '55.86000,-4.25000',
  lat: 55.86,
  lng: -4.25,
  offshore: false,
  landClass: 'farmland',
  wind: {
    annualAvgSpeedMs: 8.6,
    speedStdDevMs: 1.2,
    prevailingDirectionDeg: 225,
    directionalConsistency: 0.68,
    dataYears: 10,
    referenceHeightM: 50,
    weibullK: 2.1,
    weibullC: 7.8,
  },
  terrain: { elevationM: 187, slopePercent: 4.2, aspectDeg: 328, roughnessClass: 1 },
  energy: {
    turbineId: 'gw-2mw',
    hubHeightM: 100,
    grossCapacityFactor: 0.44,
    netCapacityFactor: 0.37,
    grossAepMwh: 7800,
    netAepMwh: 6552,
    p50Mwh: 6552,
    p75Mwh: 6010,
    p90Mwh: 5500,
    totalLossPct: 16,
    wakeLossPct: 8,
  },
  economics: { lcoePerMwh: 58, irrPct: 9.2, simplePaybackYears: 11.4, capexGbp: 2_600_000, energyPricePerMwh: 60, subsidyFree: true },
  factors: [
    { factor: 'windResource', score: 78, weight: 0.3, confidence: 'high', detail: '8.6 m/s at 100m' },
    { factor: 'terrainSuitability', score: 65, weight: 0.15, confidence: 'medium', detail: 'open grassland' },
  ],
  constraints: [{ kind: 'warning', factor: 'landUseCompatibility', severity: null, description: 'residential 480 m south' }],
  compositeScore: 72,
  overallConfidence: 'medium',
  hardConstraintCount: 0,
  windScore: 78,
  windSpeedMs: 8.6,
  capacityFactor: 0.37,
  lcoePerMwh: 58,
  subsidyFree: true,
  ...over,
});

describe('WindForgeDB', () => {
  it('writes across the normalised tables and the summary', () => {
    const db = new WindForgeDB(':memory:');
    expect(db.count()).toBe(0);
    db.upsertCell(record());
    expect(db.has('55.86000,-4.25000')).toBe(true);
    expect(db.has('missing')).toBe(false);
    expect(db.count()).toBe(1);
    expect(db.countWithLcoe()).toBe(1);
    const [c] = db.sample(10);
    expect(c?.score).toBe(72);
    expect(c?.windSpeedMs).toBe(8.6);
    expect(c?.subsidyFree).toBe(true);
    db.close();
  });

  it('upserts a cell in place across re-runs (no duplicate factor rows)', () => {
    const db = new WindForgeDB(':memory:');
    db.upsertCell(record({ compositeScore: 70 }));
    db.upsertCell(record({ compositeScore: 88 }));
    expect(db.count()).toBe(1);
    expect(db.sample(10)[0]?.score).toBe(88);
    db.close();
  });

  it('handles error cells and missing sub-data without throwing', () => {
    const db = new WindForgeDB(':memory:');
    db.upsertCell({ id: 'x', lat: 50, lng: 0, offshore: true, error: 'DATA_FETCH_FAILED', compositeScore: null });
    expect(db.count()).toBe(1);
    expect(db.countWithLcoe()).toBe(0);
    expect(db.sample(10)[0]?.offshore).toBe(true);
    db.close();
  });

  it('caps samples to the requested maximum', () => {
    const db = new WindForgeDB(':memory:');
    for (let i = 0; i < 120; i += 1) db.upsertCell(record({ id: `c${i}`, lat: 50 + i * 0.001 }));
    expect(db.count()).toBe(120);
    expect(db.sample(40).length).toBeLessThanOrEqual(40);
    db.close();
  });
});
