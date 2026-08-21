import { describe, it, expect } from 'vitest';
import { normaliseWeights, computeCompositeScore, DEFAULT_WEIGHTS } from '../src/scoring/engine.js';
import { ScoringFactor } from '../src/types/analysis.js';
import type { FactorScore } from '../src/types/analysis.js';

describe('DEFAULT_WEIGHTS', () => {
  it('sums to 1.0', () => {
    const sum =
      DEFAULT_WEIGHTS.windResource +
      DEFAULT_WEIGHTS.terrainSuitability +
      DEFAULT_WEIGHTS.gridProximity +
      DEFAULT_WEIGHTS.landUseCompatibility +
      DEFAULT_WEIGHTS.planningFeasibility +
      DEFAULT_WEIGHTS.accessLogistics;
    expect(sum).toBeCloseTo(1.0, 10);
  });
});

describe('normaliseWeights', () => {
  it('returns default weights when given empty partial', () => {
    const result = normaliseWeights({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      const sum = Object.values(result.value).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    }
  });

  it('normalises custom weights to sum to 1.0', () => {
    const result = normaliseWeights({
      windResource: 0.5,
      terrainSuitability: 0.5,
      gridProximity: 0,
      landUseCompatibility: 0,
      planningFeasibility: 0,
      accessLogistics: 0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.windResource).toBeCloseTo(0.5, 10);
      expect(result.value.terrainSuitability).toBeCloseTo(0.5, 10);
      const sum = Object.values(result.value).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    }
  });

  it('handles unnormalised weights by normalising them', () => {
    const result = normaliseWeights({
      windResource: 2,
      terrainSuitability: 2,
      gridProximity: 2,
      landUseCompatibility: 2,
      planningFeasibility: 1,
      accessLogistics: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const sum = Object.values(result.value).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);
      expect(result.value.windResource).toBeCloseTo(0.2, 10);
    }
  });

  it('rejects all-zero weights', () => {
    const result = normaliseWeights({
      windResource: 0,
      terrainSuitability: 0,
      gridProximity: 0,
      landUseCompatibility: 0,
      planningFeasibility: 0,
      accessLogistics: 0,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects negative and non-finite weights', () => {
    expect(normaliseWeights({ windResource: -0.1 }).ok).toBe(false);
    expect(normaliseWeights({ windResource: Number.NaN }).ok).toBe(false);
    expect(normaliseWeights({ windResource: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });

  it('merges partial weights with defaults', () => {
    const result = normaliseWeights({ windResource: 0.5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.windResource).toBeGreaterThan(DEFAULT_WEIGHTS.windResource);
    }
  });
});

describe('computeCompositeScore', () => {
  it('computes weighted sum of factor scores', () => {
    const factors: FactorScore[] = [
      makeFactor(ScoringFactor.WindResource, 80, 0.5),
      makeFactor(ScoringFactor.TerrainSuitability, 60, 0.5),
    ];
    // 80*0.5 + 60*0.5 = 70
    expect(computeCompositeScore(factors)).toBe(70);
  });

  it('returns null for empty factors', () => {
    expect(computeCompositeScore([])).toBeNull();
  });

  it('handles single factor', () => {
    const factors: FactorScore[] = [makeFactor(ScoringFactor.WindResource, 85, 1.0)];
    expect(computeCompositeScore(factors)).toBe(85);
  });

  it('rounds to nearest integer', () => {
    const factors: FactorScore[] = [
      makeFactor(ScoringFactor.WindResource, 33, 0.33),
      makeFactor(ScoringFactor.TerrainSuitability, 67, 0.67),
    ];
    const score = computeCompositeScore(factors);
    expect(Number.isInteger(score)).toBe(true);
  });

  it('handles zero-weight factors', () => {
    const factors: FactorScore[] = [
      makeFactor(ScoringFactor.WindResource, 100, 1.0),
      makeFactor(ScoringFactor.TerrainSuitability, 0, 0),
    ];
    expect(computeCompositeScore(factors)).toBe(100);
  });
});

function makeFactor(factor: ScoringFactor, score: number, weight: number): FactorScore {
  return {
    factor,
    score,
    weight,
    weightedScore: score * weight,
    detail: 'test',
    dataSource: 'test',
    confidence: 'high',
  };
}
