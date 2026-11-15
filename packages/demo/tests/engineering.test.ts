import { summariseRecord } from '../src/lib/engineering/records';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import type { SiteAnalysis } from '@jamieblair/windforge-core';
import { calculate, ring, options } from '../src/lib/engineering/calculate';
import { answer } from '../src/lib/engineering/assistant';
import type { Catalogue, Config } from '../src/lib/engineering/types';
const cat = JSON.parse(readFileSync('../../engineering/catalogue.json', 'utf8')) as Catalogue;
const m = cat.models[0]!,
  coord = { lat: 58.45, lng: -3.65 };
const w = {
  coordinate: coord,
  annualAverageSpeedMs: 7,
  referenceHeightM: 50,
  speedStdDevMs: 2.4,
  prevailingDirectionDeg: 270,
  dataYears: 10,
  directionalConsistency: 0.8,
  monthlyAverages: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    averageSpeedMs: 7,
    averageDirectionDeg: 270,
  })),
};
const site = {
  coordinate: coord,
  windResource: { resolved: w },
  metadata: { windShearAlpha: 0.14, completeness: { detail: 'test fixture' } },
  factors: [],
  compositeScore: null,
} as unknown as SiteAnalysis;
const cfg: Config = {
  model: m.id,
  count: 6,
  hub: m.hubM,
  wake: 8,
  sector: 'whole',
  capex: null,
  opex: null,
};
describe('reference design integration', () => {
  it('preserves actual electrical units and all source operating ranges', () => {
    expect(m.ratedKw).toBe(3370);
    expect(m.curve[0]![1]).toBeCloseTo(51.6203274);
    expect(cat.models.every((x) => x.fullCurve && x.curve.at(-1)?.[0] === x.cutOut)).toBe(true);
    expect(
      cat.models
        .filter((m) => m.drive === 'direct_drive')
        .every((m) => m.nodes.every((n) => n.id !== 'gearbox')),
    ).toBe(true);
  });
  it('scales fixed-loss energy with count, leaving the missing site score and acoustics unresolved', () => {
    const six = calculate(site, m, cfg, null, null, 'onshore'),
      four = calculate(site, m, { ...cfg, count: 4 }, null, null, 'onshore');
    expect(six.energy!.netTotalAepMwh / four.energy!.netTotalAepMwh).toBeCloseTo(1.5, 3);
    expect(six.capacityMw).toBeCloseTo(20.22);
    expect(six.gaps.join(' ')).toMatch(/acoustic/);
    expect(six.lcoe).toBeNull();
  });
  it('never silently drops holes or extrapolates a failed layout', () => {
    const polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-3.66, 58.44],
          [-3.64, 58.44],
          [-3.64, 58.46],
          [-3.66, 58.46],
          [-3.66, 58.44],
        ],
      ],
    };
    expect(() =>
      ring({ ...polygon, coordinates: [...polygon.coordinates, ...polygon.coordinates] }, coord),
    ).toThrow();
    const geom = {
      ring: ring(polygon, coord),
      zones: null,
      source: 'outage',
      stamp: null,
      retrieved: '',
    };
    expect(calculate(site, m, cfg, geom, null, 'onshore').energy).toBeNull();
    expect(
      calculate({ ...site, windResource: null }, m, cfg, null, null, 'unknown').energy,
    ).toBeNull();
    expect(() => options({ ...cfg, hub: 2 }, cat.models)).toThrow();
  });
  it('does not borrow a research failure or a geared ratio for a direct-drive assembly', async () => {
    const d = cat.models[1]!;
    const q = await answer(
      'What is the gear ratio?',
      d,
      d.nodes.find((n) => n.id === 'assembly')!,
      cat.sources,
      null,
      d.id,
      async () => [],
    );
    expect(q.type).toBe('Unresolved');
    const a = await answer(
      'Can I repair this gearbox?',
      m,
      m.nodes[0]!,
      cat.sources,
      null,
      'grc',
      async () => {
        throw Error('must not retrieve');
      },
    );
    expect(a.type).toBe('Unresolved');
  });
});

it('reports measured CSV ranges only when values and units support them', () => {
  expect(summariseRecord('test.csv', 'Time,Speed [rpm],Temp [C]\nt0,800,21\nt1,1000,')).toContain(
    'Speed [rpm]: 800 to 1000',
  );
  expect(summariseRecord('test.csv', 'Time,Speed [rpm]\nt0,=1+1')).toContain(
    'No purely numeric column',
  );
});
it('rejects an acoustic value without applicable source information', () => {
  expect(() => options({ ...cfg, soundDba: 100 }, cat.models)).toThrow(/acoustic/);
});
