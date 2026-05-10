import { describe, expect, it } from 'vitest';
import type { MonthlyWindHistory } from '@jamieblair/windforge-core';
import { windRoseFromHistory } from '../../src/components/charts/windRoseFromHistory';

const sample: MonthlyWindHistory = {
  coordinate: { lat: 55.86, lng: -4.25 },
  records: [
    // Westerly band
    { year: 2024, month: 1, ws2m: 4, ws10m: 6, ws50m: 9, wd10m: 270, wd50m: 270 },
    { year: 2024, month: 2, ws2m: 4, ws10m: 6, ws50m: 8.5, wd10m: 268, wd50m: 268 },
    // Southerly
    { year: 2024, month: 3, ws2m: 3, ws10m: 4, ws50m: 5, wd10m: 180, wd50m: 180 },
    // Northerly weak
    { year: 2024, month: 4, ws2m: 2, ws10m: 3, ws50m: 3.5, wd10m: 0, wd50m: 0 },
  ],
  startYear: 2024,
  endYear: 2024,
};

describe('windRoseFromHistory', () => {
  it('returns 16 compass rows', () => {
    const rows = windRoseFromHistory(sample);
    expect(rows).toHaveLength(16);
  });

  it('returns frequencies as percentages of the total record count', () => {
    const rows = windRoseFromHistory(sample);
    let total = 0;
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        if (key === 'direction') continue;
        total += value as number;
      }
    }
    expect(Math.round(total)).toBe(100);
  });

  it('places westerly records on the W direction row', () => {
    const rows = windRoseFromHistory(sample);
    const west = rows.find((r) => r.direction === 'W');
    expect(west).toBeDefined();
    let westTotal = 0;
    for (const [key, value] of Object.entries(west!)) {
      if (key === 'direction') continue;
      westTotal += value as number;
    }
    expect(westTotal).toBeGreaterThan(40);
  });

  it('returns an empty rose for empty histories', () => {
    const empty = windRoseFromHistory({ ...sample, records: [] });
    expect(empty).toHaveLength(16);
    for (const row of empty) {
      for (const [key, value] of Object.entries(row)) {
        if (key === 'direction') continue;
        expect(value).toBe(0);
      }
    }
  });
});
