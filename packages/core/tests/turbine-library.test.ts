import { describe, it, expect } from 'vitest';
import {
  getAllTurbines,
  getTurbineById,
  getTurbinesByPowerRange,
} from '../src/turbines/turbine-library.js';
import { parsePowerCurveCSV } from '../src/turbines/power-curve-parser.js';

describe('turbine-library', () => {
  describe('getAllTurbines', () => {
    it('returns all 12 turbine models', () => {
      const turbines = getAllTurbines();
      expect(turbines).toHaveLength(12);
    });

    it('every turbine has required fields', () => {
      for (const t of getAllTurbines()) {
        expect(t.id).toBeTruthy();
        expect(t.manufacturer).toBeTruthy();
        expect(t.model).toBeTruthy();
        expect(t.ratedPowerKw).toBeGreaterThan(0);
        expect(t.rotorDiameterM).toBeGreaterThan(0);
        expect(t.hubHeightOptionsM.length).toBeGreaterThan(0);
        expect(t.cutInSpeedMs).toBeGreaterThan(0);
        expect(t.ratedSpeedMs).toBeGreaterThan(t.cutInSpeedMs);
        expect(t.cutOutSpeedMs).toBeGreaterThan(t.ratedSpeedMs);
        expect(t.powerCurve.length).toBeGreaterThan(10);
      }
    });

    it('power curves follow physical rules', () => {
      for (const t of getAllTurbines()) {
        // Below cut-in should be zero
        const belowCutIn = t.powerCurve.filter((p) => p.windSpeedMs < t.cutInSpeedMs);
        for (const p of belowCutIn) {
          expect(p.powerKw).toBe(0);
        }

        // At rated speed, power should be close to rated
        const atRated = t.powerCurve.find((p) => p.windSpeedMs === t.ratedSpeedMs);
        if (atRated) {
          expect(atRated.powerKw).toBeCloseTo(t.ratedPowerKw, -1);
        }

        // Above cut-out should be zero
        const aboveCutOut = t.powerCurve.filter((p) => p.windSpeedMs > t.cutOutSpeedMs);
        for (const p of aboveCutOut) {
          expect(p.powerKw).toBe(0);
        }

        // No power value exceeds rated power
        for (const p of t.powerCurve) {
          expect(p.powerKw).toBeLessThanOrEqual(t.ratedPowerKw + 1);
        }
      }
    });
  });

  describe('getTurbineById', () => {
    it('returns matching turbine for valid ID', () => {
      const t = getTurbineById('vestas-v90-2000');
      expect(t).toBeDefined();
      expect(t!.manufacturer).toBe('Vestas');
      expect(t!.ratedPowerKw).toBe(2000);
    });

    it('returns undefined for invalid ID', () => {
      expect(getTurbineById('nonexistent')).toBeUndefined();
    });

    it('returns each turbine by its declared ID', () => {
      for (const t of getAllTurbines()) {
        const found = getTurbineById(t.id);
        expect(found).toBeDefined();
        expect(found!.id).toBe(t.id);
      }
    });
  });

  describe('getTurbinesByPowerRange', () => {
    it('returns small turbines (< 1000 kW)', () => {
      const small = getTurbinesByPowerRange(0, 999);
      expect(small.length).toBeGreaterThanOrEqual(2);
      for (const t of small) {
        expect(t.ratedPowerKw).toBeLessThan(1000);
      }
    });

    it('returns medium turbines (1000-3000 kW)', () => {
      const medium = getTurbinesByPowerRange(1000, 3000);
      expect(medium.length).toBeGreaterThanOrEqual(3);
      for (const t of medium) {
        expect(t.ratedPowerKw).toBeGreaterThanOrEqual(1000);
        expect(t.ratedPowerKw).toBeLessThanOrEqual(3000);
      }
    });

    it('returns large turbines (> 5000 kW)', () => {
      const large = getTurbinesByPowerRange(5000, 10000);
      expect(large.length).toBeGreaterThanOrEqual(3);
      for (const t of large) {
        expect(t.ratedPowerKw).toBeGreaterThanOrEqual(5000);
      }
    });

    it('returns empty array for impossible range', () => {
      expect(getTurbinesByPowerRange(100000, 200000)).toHaveLength(0);
    });
  });
});

describe('parsePowerCurveCSV', () => {
  it('parses valid CSV data', () => {
    const csv = 'wind_speed,power\n0,0\n3,0\n5,100\n10,500\n15,660\n20,660\n25,660\n26,0';
    const result = parsePowerCurveCSV(csv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Parser interpolates to 0.5 m/s steps (0-30 = 61 points)
      expect(result.value.length).toBe(61);
      expect(result.value[0]!.windSpeedMs).toBe(0);
      expect(result.value[0]!.powerKw).toBe(0);
    }
  });

  it('rejects empty CSV', () => {
    const result = parsePowerCurveCSV('');
    expect(result.ok).toBe(false);
  });

  it('rejects CSV with only header', () => {
    const result = parsePowerCurveCSV('wind_speed,power');
    expect(result.ok).toBe(false);
  });

  it('rejects CSV with negative wind speeds', () => {
    const csv = 'wind_speed,power\n-1,0\n5,100';
    const result = parsePowerCurveCSV(csv);
    expect(result.ok).toBe(false);
  });

  it('rejects CSV with negative power', () => {
    const csv = 'wind_speed,power\n5,-100\n10,500';
    const result = parsePowerCurveCSV(csv);
    expect(result.ok).toBe(false);
  });

  it('handles whitespace and mixed separators', () => {
    const csv = ' wind_speed , power \n 0 , 0 \n 5 , 100 \n 10 , 500 ';
    const result = parsePowerCurveCSV(csv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Parser interpolates to 0.5 m/s steps (0-30 = 61 points)
      expect(result.value.length).toBe(61);
    }
  });
});
