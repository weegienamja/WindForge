import { describe, it, expect } from 'vitest';
import { calculateAep } from '../src/energy/aep-calculator.js';
import { getTurbineById } from '../src/turbines/turbine-library.js';
import type { WindDataSummary } from '../src/types/datasources.js';
import type { TurbineModel } from '../src/types/turbines.js';

function makeWindData(overrides: Partial<WindDataSummary> = {}): WindDataSummary {
  return {
    coordinate: { lat: 55.86, lng: -4.25 },
    annualAverageSpeedMs: 7.5,
    speedStdDevMs: 3.5,
    prevailingDirectionDeg: 240,
    directionalConsistency: 0.65,
    dataYears: 10,
    referenceHeightM: 50,
    monthlyAverages: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      averageSpeedMs: 6.5 + 2 * Math.sin(((i + 3) * Math.PI) / 6), // seasonal variation
      averageDirectionDeg: 240,
    })),
    ...overrides,
  };
}

function getTestTurbine(): TurbineModel {
  const t = getTurbineById('vestas-v90-2000');
  if (!t) throw new Error('Test turbine not found');
  return t;
}

describe('calculateAep', () => {
  describe('basic operation', () => {
    it('returns ok result for valid inputs', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      expect(result.ok).toBe(true);
    });

    it('returns correct turbine model info', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.turbineModel.id).toBe('vestas-v90-2000');
      expect(result.value.turbineModel.ratedPowerKw).toBe(2000);
    });

    it('returns positive gross and net AEP', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.grossAepMwh).toBeGreaterThan(0);
      expect(result.value.netAepMwh).toBeGreaterThan(0);
    });

    it('net AEP is less than gross AEP (losses applied)', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.netAepMwh).toBeLessThan(result.value.grossAepMwh);
    });

    it('capacity factor is between 0 and 1', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.grossCapacityFactor).toBeGreaterThan(0);
      expect(result.value.grossCapacityFactor).toBeLessThan(1);
      expect(result.value.netCapacityFactor).toBeGreaterThan(0);
      expect(result.value.netCapacityFactor).toBeLessThan(1);
    });
  });

  describe('error handling', () => {
    it('returns error for zero wind speed', () => {
      const result = calculateAep(
        makeWindData({ annualAverageSpeedMs: 0 }),
        getTestTurbine(),
      );
      expect(result.ok).toBe(false);
    });

    it('returns error for negative wind speed', () => {
      const result = calculateAep(
        makeWindData({ annualAverageSpeedMs: -1 }),
        getTestTurbine(),
      );
      expect(result.ok).toBe(false);
    });

    it('returns error for turbine with insufficient power curve', () => {
      const badTurbine: TurbineModel = {
        ...getTestTurbine(),
        powerCurve: [{ windSpeedMs: 0, powerKw: 0 }],
      };
      const result = calculateAep(makeWindData(), badTurbine);
      expect(result.ok).toBe(false);
    });
  });

  describe('hub height effects', () => {
    it('uses specified hub height', () => {
      const result = calculateAep(makeWindData(), getTestTurbine(), { hubHeightM: 105 });
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.hubHeightM).toBe(105);
    });

    it('higher hub height produces more energy (wind shear)', () => {
      const low = calculateAep(makeWindData(), getTestTurbine(), { hubHeightM: 60 });
      const high = calculateAep(makeWindData(), getTestTurbine(), { hubHeightM: 120 });
      if (!low.ok || !high.ok) throw new Error('Expected ok');
      expect(high.value.grossAepMwh).toBeGreaterThan(low.value.grossAepMwh);
    });
  });

  describe('wind speed effects', () => {
    it('higher wind speed produces more energy', () => {
      const low = calculateAep(makeWindData({ annualAverageSpeedMs: 5.0 }), getTestTurbine());
      const high = calculateAep(makeWindData({ annualAverageSpeedMs: 9.0 }), getTestTurbine());
      if (!low.ok || !high.ok) throw new Error('Expected ok');
      expect(high.value.grossAepMwh).toBeGreaterThan(low.value.grossAepMwh);
    });
  });

  describe('P-scenarios', () => {
    it('P50 >= P75 >= P90', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.p50.aepMwh).toBeGreaterThanOrEqual(result.value.p75.aepMwh);
      expect(result.value.p75.aepMwh).toBeGreaterThanOrEqual(result.value.p90.aepMwh);
    });

    it('P50 matches net AEP', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      // P50 is median (z=0), so it should match net AEP per turbine
      expect(result.value.p50.aepMwh).toBeCloseTo(result.value.netAepMwh, 0);
    });

    it('each scenario has a description', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.p50.description).toBeTruthy();
      expect(result.value.p75.description).toBeTruthy();
      expect(result.value.p90.description).toBeTruthy();
    });
  });

  describe('loss stack', () => {
    it('produces non-zero total loss', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.losses.totalLossPct).toBeGreaterThan(0);
    });

    it('total loss is less than 50% (sanity check)', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.losses.totalLossPct).toBeLessThan(50);
    });

    it('contains all 7 loss items', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.losses.items).toHaveLength(7);
    });

    it('custom loss overrides are applied', () => {
      // turbineCount > 1 to avoid single-turbine wake loss cap
      const result = calculateAep(makeWindData(), getTestTurbine(), {
        turbineCount: 5,
        losses: { wakeLossPct: 15, electricalLossPct: 5 },
      });
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.losses.wakeLossPct).toBe(15);
      expect(result.value.losses.electricalLossPct).toBe(5);
    });
  });

  describe('multi-turbine', () => {
    it('total AEP scales with turbine count', () => {
      const single = calculateAep(makeWindData(), getTestTurbine(), { turbineCount: 1 });
      const multi = calculateAep(makeWindData(), getTestTurbine(), { turbineCount: 5 });
      if (!single.ok || !multi.ok) throw new Error('Expected ok');
      // Total AEP for 5 turbines should be ~ 5x single. Not exact because of wake adjustment.
      expect(multi.value.netTotalAepMwh).toBeGreaterThan(single.value.netTotalAepMwh * 3);
    });

    it('per-turbine AEP changes between single and multi-turbine (wake)', () => {
      const single = calculateAep(makeWindData(), getTestTurbine(), { turbineCount: 1 });
      const multi = calculateAep(makeWindData(), getTestTurbine(), { turbineCount: 10 });
      if (!single.ok || !multi.ok) throw new Error('Expected ok');
      // Single turbine has reduced wake loss
      expect(single.value.losses.wakeLossPct).toBeLessThanOrEqual(multi.value.losses.wakeLossPct);
    });
  });

  describe('monthly production', () => {
    it('returns 12 monthly values', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.monthlyProductionMwh).toHaveLength(12);
    });

    it('all monthly values are non-negative', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      for (const m of result.value.monthlyProductionMwh) {
        expect(m).toBeGreaterThanOrEqual(0);
      }
    });

    it('monthly sum is in same order of magnitude as annual', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      const monthlySum = result.value.monthlyProductionMwh.reduce((a, b) => a + b, 0);
      // Should be roughly similar to net AEP (same order of magnitude)
      expect(monthlySum).toBeGreaterThan(result.value.netAepMwh * 0.5);
      expect(monthlySum).toBeLessThan(result.value.netAepMwh * 2);
    });
  });

  describe('elevation effects', () => {
    it('higher elevation reduces AEP (lower air density)', () => {
      const sea = calculateAep(makeWindData(), getTestTurbine(), { elevationM: 0 });
      const mtn = calculateAep(makeWindData(), getTestTurbine(), { elevationM: 1000 });
      if (!sea.ok || !mtn.ok) throw new Error('Expected ok');
      expect(mtn.value.grossAepMwh).toBeLessThan(sea.value.grossAepMwh);
    });
  });

  describe('confidence level', () => {
    it('high confidence for 10+ years of data', () => {
      const result = calculateAep(makeWindData({ dataYears: 15 }), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.confidence).toBe('high');
    });

    it('medium confidence for 5-9 years', () => {
      const result = calculateAep(makeWindData({ dataYears: 7 }), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.confidence).toBe('medium');
    });

    it('low confidence for < 5 years', () => {
      const result = calculateAep(makeWindData({ dataYears: 3 }), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.confidence).toBe('low');
    });
  });

  describe('assumptions', () => {
    it('stores all assumption details', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      const a = result.value.assumptions;
      expect(a.windDataYears).toBe(10);
      expect(a.referenceHeightM).toBe(50);
      expect(a.airDensityKgM3).toBeGreaterThan(0);
      expect(a.weibullK).toBeGreaterThan(0);
      expect(a.weibullC).toBeGreaterThan(0);
      expect(a.extrapolationMethod).toBeTruthy();
    });
  });

  describe('summary text', () => {
    it('includes manufacturer and model', () => {
      const result = calculateAep(makeWindData(), getTestTurbine());
      if (!result.ok) throw new Error('Expected ok');
      expect(result.value.summary).toContain('Vestas');
      expect(result.value.summary).toContain('V90');
    });
  });

  describe('different turbine models', () => {
    it('larger turbine produces more energy at same site', () => {
      const small = getTurbineById('vestas-v47-660')!;
      const large = getTurbineById('vestas-v172-7200')!;
      const wind = makeWindData();
      const rSmall = calculateAep(wind, small);
      const rLarge = calculateAep(wind, large);
      if (!rSmall.ok || !rLarge.ok) throw new Error('Expected ok');
      expect(rLarge.value.grossAepMwh).toBeGreaterThan(rSmall.value.grossAepMwh);
    });
  });
});
