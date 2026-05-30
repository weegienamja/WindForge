import { describe, expect, it } from 'vitest';
import { HeatmapStore } from '../scripts/lib/heatmap-store';
import type { HeatmapCell } from '../src/lib/heatmap';

const cell = (over: Partial<HeatmapCell> = {}): HeatmapCell => ({
  lat: 55.86,
  lng: -4.25,
  offshore: false,
  landuse: 'farmland',
  score: 72,
  windScore: 78,
  windSpeedMs: 8.6,
  capacityFactor: 0.41,
  lcoePerMwh: 58,
  subsidyFree: true,
  hardConstraints: 0,
  confidence: 'medium',
  ...over,
});

describe('HeatmapStore', () => {
  it('inserts, reports membership and counts', () => {
    const store = new HeatmapStore(':memory:');
    expect(store.count()).toBe(0);
    store.upsert('a', cell());
    expect(store.has('a')).toBe(true);
    expect(store.has('missing')).toBe(false);
    expect(store.count()).toBe(1);
    expect(store.countWithLcoe()).toBe(1);
    store.close();
  });

  it('upserts in place (no duplicate rows for the same id)', () => {
    const store = new HeatmapStore(':memory:');
    store.upsert('a', cell({ score: 70 }));
    store.upsert('a', cell({ score: 88 }));
    expect(store.count()).toBe(1);
    expect(store.sample(10)[0]?.score).toBe(88);
    store.close();
  });

  it('round-trips booleans, nulls and land-use through SQLite', () => {
    const store = new HeatmapStore(':memory:');
    store.upsert('sea', cell({ offshore: true, subsidyFree: false, landuse: undefined, lcoePerMwh: null }));
    const [c] = store.sample(10);
    expect(c?.offshore).toBe(true);
    expect(c?.subsidyFree).toBe(false);
    expect(c?.lcoePerMwh).toBeNull();
    expect(store.countWithLcoe()).toBe(0);
    store.close();
  });

  it('samples are capped to the requested maximum', () => {
    const store = new HeatmapStore(':memory:');
    for (let i = 0; i < 200; i += 1) store.upsert(`c${i}`, cell({ lat: 50 + i * 0.001 }));
    expect(store.count()).toBe(200);
    expect(store.sample(50).length).toBeLessThanOrEqual(50);
    store.close();
  });
});
