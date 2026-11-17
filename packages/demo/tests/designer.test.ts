import { describe, expect, it } from 'vitest';
import {
  calculateAep,
  calculateNoiseAtReceptor,
  calculateShadowFlicker,
  getTurbineById,
  generateCashflow,
  calculateLcoe,
} from '@jamieblair/windforge-core';
import {
  createProject,
  checkedBoundary,
  EXAMPLE,
  newLayout,
  readProject,
} from '../src/lib/designer/project';
import { evaluateLayout } from '../src/lib/designer/evaluate';
describe('farm designer', () => {
  it('passes the edited positions, resolved wind, hub and costs unchanged into the existing models', () => {
    const p = createProject(EXAMPLE),
      l = p.layouts[1]!,
      e = p.evidence!,
      t = getTurbineById(l.turbineId)!;
    l.positions[1] = { lat: 58.444, lng: -3.656 };
    l.hub = 105;
    l.opex = 52000;
    l.capex = 1500000;
    p.price = 82;
    const actual = evaluateLayout(p, l);
    const a = calculateAep(e.wind!, t, {
      hubHeightM: l.hub,
      turbineCount: l.positions.length,
      windShearAlpha: e.shear,
      wakeModel: 'jensen',
      layoutPositions: l.positions,
    });
    if (!a.ok) throw Error(a.error.message);
    const params = { capexPerMw: l.capex, opexPerMwPerYear: l.opex, energyPricePerMwh: p.price };
    const towers = l.positions.map((location, id) => ({
      id,
      location,
      hubHeightM: l.hub,
      rotorDiameterM: t.rotorDiameterM,
    }));
    expect(actual).toMatchObject({
      messages: [],
      energy: a.value.netTotalAepMwh,
      wake: a.value.losses.wakeLossPct,
      lcoe: calculateLcoe(a.value, params).lcoePerMwh,
      npv: generateCashflow(a.value, params).npvGbp,
      noise: calculateNoiseAtReceptor(towers, p.receptor!, t.soundPowerLevelDba!, l.hub)
        .predictedLevelDba,
      shadow: calculateShadowFlicker(towers, [p.receptor!], { year: 2025, receptorHeightM: 2 })
        .receptors[0]?.hoursPerYear,
    });
  });
  it('distinguishes geometry with the same turbine count and responds to price without changing energy', () => {
    const p = createProject(EXAMPLE),
      a = evaluateLayout(p, p.layouts[0]!),
      b = evaluateLayout(p, p.layouts[1]!);
    expect(a.count).toBe(b.count);
    expect(a.wake).not.toBe(b.wake);
    expect(a.energy).not.toBe(b.energy);
    expect(a.noise).not.toBe(b.noise);
    expect(a.npv).not.toBe(b.npv);
    p.price += 20;
    const c = evaluateLayout(p, p.layouts[0]!);
    expect(c.energy).toBe(a.energy);
    expect(c.npv!).toBeGreaterThan(a.npv!);
  });
  it('withholds affected results for empty, overlapping or outside layouts and missing evidence or receptor', () => {
    const p = createProject(EXAMPLE),
      l = p.layouts[0]!;
    expect(evaluateLayout(p, newLayout('empty'))).toMatchObject({
      energy: null,
      capacity: 0,
      npv: null,
    });
    l.positions.push(l.positions[0]!);
    expect(evaluateLayout(p, l)).toMatchObject({ energy: null, noise: null });
    l.positions.pop();
    l.positions.push({ lat: 58.6, lng: -3.6 });
    expect(evaluateLayout(p, l).messages.join(' ')).toContain('outside');
    l.positions.pop();
    p.receptor = null;
    expect(evaluateLayout(p, l)).toMatchObject({ noise: null, shadow: null });
    expect(evaluateLayout(p, l).energy).toBeGreaterThan(0);
    p.receptor = EXAMPLE;
    p.evidence = null;
    const partial = evaluateLayout(p, l);
    expect(partial).toMatchObject({ energy: null, lcoe: null, npv: null });
    expect(partial.noise).toBeGreaterThan(0);
  });
  it('reopens multiple alternatives, including their selected layout, footprint, receptor and costs', () => {
    const p = createProject(EXAMPLE);
    p.layouts.push(newLayout('North field'));
    p.active = p.layouts[2]!.id;
    p.layouts[2]!.capex = 1.6e6;
    p.receptor = null;
    p.price = 95;
    expect(readProject(JSON.stringify(p), EXAMPLE)).toEqual(p);
    expect(() => readProject(JSON.stringify(p), { lat: 58, lng: -3 })).toThrow();
    const other = createProject({ lat: 57, lng: -3 });
    expect(other.evidence).toBeNull();
    expect(other.layouts[0]?.positions).toEqual([]);
    expect(() => readProject(JSON.stringify({ ...p, evidence: other }), EXAMPLE)).toThrow();
  });
  it('rejects a crossed boundary, a missing active layout and unknown machine', () => {
    const p = createProject(EXAMPLE),
      [a, b, c, d] = p.boundary;
    expect(() => checkedBoundary([a!, c!, b!, d!], p.site)).toThrow();
    expect(() => readProject(JSON.stringify({ ...p, active: 'missing' }), EXAMPLE)).toThrow();
    p.layouts[0]!.turbineId = 'missing';
    expect(() => readProject(JSON.stringify(p), EXAMPLE)).toThrow();
  });
});
