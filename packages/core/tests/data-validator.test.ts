import { describe, it, expect } from 'vitest';
import {
  validateWindData,
  validateElevationData,
  validateCoordinateArray,
} from '../src/validation/data-validator.js';

function validWindInput() {
  return {
    coordinate: { lat: 55.86, lng: -4.25 },
    monthlyAverages: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      averageSpeedMs: 6 + Math.random(),
      averageDirectionDeg: 220,
    })),
    annualAverageSpeedMs: 6.5,
    speedStdDevMs: 3.2,
    prevailingDirectionDeg: 220,
    directionalConsistency: 0.6,
    dataYears: 10,
  };
}

function validElevationInput() {
  return {
    coordinate: { lat: 55.86, lng: -4.25 },
    elevationM: 450,
    slopePercent: 12,
    aspectDeg: 180,
    roughnessClass: 1,
  };
}

describe('Data Validator', () => {
  describe('validateWindData', () => {
    it('accepts valid wind data', () => {
      const result = validateWindData(validWindInput());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects non-object input', () => {
      const result = validateWindData(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.cleanedData).toBeNull();
    });

    it('rejects NaN annualAverageSpeedMs', () => {
      const input = validWindInput();
      input.annualAverageSpeedMs = NaN;
      const result = validateWindData(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('annualAverageSpeedMs'))).toBe(true);
    });

    it('warns on speed above 100 m/s', () => {
      const input = validWindInput();
      input.annualAverageSpeedMs = 150;
      const result = validateWindData(input);
      // Implementation may warn or error, but should flag it
      expect(result.warnings.length + result.errors.length).toBeGreaterThan(0);
    });

    it('handles missing monthlyAverages array', () => {
      const input = validWindInput();
      (input as Record<string, unknown>).monthlyAverages = 'not an array';
      const result = validateWindData(input);
      expect(result.valid).toBe(false);
    });

    it('rejects a NaN monthly speed without substituting zero', () => {
      const input = validWindInput();
      input.monthlyAverages[3].averageSpeedMs = NaN;
      const result = validateWindData(input);
      expect(result.errors.some((e: string) => e.includes('Month 4'))).toBe(true);
      expect(result.cleanedData).toBeNull();
    });

    it('wraps prevailing direction outside 0-360', () => {
      const input = validWindInput();
      input.prevailingDirectionDeg = 400;
      const result = validateWindData(input);
      expect(result.cleanedData?.prevailingDirectionDeg).toBeCloseTo(40, 1);
    });

    it('rejects an out-of-range annual speed instead of clamping to zero', () => {
      const input = validWindInput();
      input.annualAverageSpeedMs = -5;
      const result = validateWindData(input);
      expect(result.valid).toBe(false);
      expect(result.cleanedData).toBeNull();
    });
  });

  describe('validateElevationData', () => {
    it('accepts valid elevation data', () => {
      const result = validateElevationData(validElevationInput());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects non-object input', () => {
      const result = validateElevationData('not an object');
      expect(result.valid).toBe(false);
    });

    it('rejects elevation below -500m', () => {
      const input = validElevationInput();
      input.elevationM = -600;
      const result = validateElevationData(input);
      expect(result.errors.some((e: string) => e.includes('elevationM'))).toBe(true);
      expect(result.cleanedData).toBeNull();
    });

    it('rejects elevation above 9000m', () => {
      const input = validElevationInput();
      input.elevationM = 10000;
      const result = validateElevationData(input);
      expect(result.errors.some((e: string) => e.includes('elevationM'))).toBe(true);
    });

    it('does not invent a boundary value for invalid elevation', () => {
      const input = validElevationInput();
      input.elevationM = 15000;
      const result = validateElevationData(input);
      expect(result.cleanedData).toBeNull();
    });

    it('wraps aspect outside 0-360', () => {
      const input = validElevationInput();
      input.aspectDeg = -30;
      const result = validateElevationData(input);
      expect(result.cleanedData?.aspectDeg).toBeCloseTo(330, 1);
    });
  });

  describe('validateCoordinateArray', () => {
    it('accepts valid coordinate array', () => {
      const result = validateCoordinateArray([
        { lat: 55.86, lng: -4.25 },
        { lat: 55.87, lng: -4.24 },
      ]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects coordinates with out-of-range latitude', () => {
      const result = validateCoordinateArray([{ lat: 95, lng: 0 }]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.toLowerCase().includes('lat'))).toBe(true);
    });

    it('rejects coordinates with out-of-range longitude', () => {
      const result = validateCoordinateArray([{ lat: 50, lng: 200 }]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.toLowerCase().includes('lng'))).toBe(true);
    });

    it('rejects coordinates with NaN values', () => {
      const result = validateCoordinateArray([{ lat: NaN, lng: -4.25 }]);
      expect(result.valid).toBe(false);
    });

    it('passes valid coords and rejects invalid ones in mixed array', () => {
      const result = validateCoordinateArray([
        { lat: 55, lng: -4 },
        { lat: 200, lng: 0 },
      ]);
      expect(result.valid).toBe(false);
      expect(result.cleanedData).toHaveLength(1);
      expect(result.cleanedData?.[0]?.lat).toBe(55);
    });
  });
});
