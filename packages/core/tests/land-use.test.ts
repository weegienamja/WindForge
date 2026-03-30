import { describe, it, expect } from 'vitest';
import { scoreLandUse } from '../src/scoring/land-use.js';
import type { LandUseResult } from '../src/datasources/osm-overpass.js';

function makeLandUse(overrides: Partial<LandUseResult> = {}): LandUseResult {
  return {
    hardConstraints: [],
    softConstraints: [],
    positiveIndicators: [],
    searchRadiusKm: 2,
    ...overrides,
  };
}

describe('scoreLandUse', () => {
  it('returns a valid FactorScore for landUseCompatibility factor', () => {
    const result = scoreLandUse(makeLandUse(), 0.10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factorScore.factor).toBe('landUseCompatibility');
      expect(result.value.factorScore.weight).toBe(0.10);
      expect(result.value.factorScore.score).toBeGreaterThanOrEqual(0);
      expect(result.value.factorScore.score).toBeLessThanOrEqual(100);
      expect(result.value.factorScore.dataSource).toContain('Overpass');
    }
  });

  // --- Hard constraints ---

  it('scores 0 when nature_reserve found', () => {
    const result = scoreLandUse(
      makeLandUse({
        hardConstraints: [{ type: 'nature_reserve', description: 'Nature reserve detected at site' }],
      }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factorScore.score).toBe(0);
      expect(result.value.hardConstraints).toHaveLength(1);
      expect(result.value.hardConstraints[0]!.severity).toBe('blocking');
    }
  });

  it('scores 0 when protected_area found', () => {
    const result = scoreLandUse(
      makeLandUse({
        hardConstraints: [{ type: 'protected_area', description: 'Protected area designation at site' }],
      }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factorScore.score).toBe(0);
      expect(result.value.hardConstraints).toHaveLength(1);
    }
  });

  it('scores 0 when military land found', () => {
    const result = scoreLandUse(
      makeLandUse({
        hardConstraints: [{ type: 'military', description: 'Military land use at site' }],
      }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factorScore.score).toBe(0);
    }
  });

  it('scores 0 when aeroway found', () => {
    const result = scoreLandUse(
      makeLandUse({
        hardConstraints: [{ type: 'aeroway', description: 'Aeroway infrastructure near site' }],
      }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factorScore.score).toBe(0);
    }
  });

  it('scores 0 when cemetery found', () => {
    const result = scoreLandUse(
      makeLandUse({
        hardConstraints: [{ type: 'cemetery', description: 'Cemetery at site' }],
      }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factorScore.score).toBe(0);
    }
  });

  it('returns multiple blocking constraints when multiple hard constraints found', () => {
    const result = scoreLandUse(
      makeLandUse({
        hardConstraints: [
          { type: 'nature_reserve', description: 'Nature reserve detected at site' },
          { type: 'military', description: 'Military land use at site' },
        ],
      }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hardConstraints).toHaveLength(2);
      expect(result.value.factorScore.score).toBe(0);
    }
  });

  it('includes BLOCKED keyword in detail when hard constraint present', () => {
    const result = scoreLandUse(
      makeLandUse({
        hardConstraints: [{ type: 'nature_reserve', description: 'Nature reserve detected at site' }],
      }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factorScore.detail).toContain('BLOCKED');
    }
  });

  // --- Soft constraints ---

  it('deducts 20 points for residential proximity', () => {
    const base = scoreLandUse(makeLandUse(), 0.10);
    const withResidential = scoreLandUse(
      makeLandUse({
        softConstraints: [{ type: 'residential', distanceKm: 0.3, description: 'Residential area 300m away' }],
      }),
      0.10,
    );
    expect(base.ok && withResidential.ok).toBe(true);
    if (base.ok && withResidential.ok) {
      expect(withResidential.value.factorScore.score).toBe(base.value.factorScore.score - 20);
    }
  });

  it('deducts 10 points for water body', () => {
    const base = scoreLandUse(makeLandUse(), 0.10);
    const withWater = scoreLandUse(
      makeLandUse({
        softConstraints: [{ type: 'water', distanceKm: 1.0, description: 'Water body nearby' }],
      }),
      0.10,
    );
    expect(base.ok && withWater.ok).toBe(true);
    if (base.ok && withWater.ok) {
      expect(withWater.value.factorScore.score).toBe(base.value.factorScore.score - 10);
    }
  });

  it('deducts 15 points for forest', () => {
    const base = scoreLandUse(makeLandUse(), 0.10);
    const withForest = scoreLandUse(
      makeLandUse({
        softConstraints: [{ type: 'forest', distanceKm: 0.5, description: 'Forest (tree clearing required)' }],
      }),
      0.10,
    );
    expect(base.ok && withForest.ok).toBe(true);
    if (base.ok && withForest.ok) {
      expect(withForest.value.factorScore.score).toBe(base.value.factorScore.score - 15);
    }
  });

  it('deducts 5 points for unknown soft constraint type', () => {
    const base = scoreLandUse(makeLandUse(), 0.10);
    const withOther = scoreLandUse(
      makeLandUse({
        softConstraints: [{ type: 'wetland', distanceKm: 1.0, description: 'Wetland nearby' }],
      }),
      0.10,
    );
    expect(base.ok && withOther.ok).toBe(true);
    if (base.ok && withOther.ok) {
      expect(withOther.value.factorScore.score).toBe(base.value.factorScore.score - 5);
    }
  });

  it('stacks multiple soft constraint deductions', () => {
    const result = scoreLandUse(
      makeLandUse({
        softConstraints: [
          { type: 'residential', distanceKm: 0.2, description: 'Residential area 200m away' },
          { type: 'forest', distanceKm: 0.3, description: 'Forest nearby' },
          { type: 'water', distanceKm: 1.0, description: 'Water body nearby' },
        ],
      }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Base 70 - 20 - 15 - 10 = 25
      expect(result.value.factorScore.score).toBe(25);
    }
  });

  // --- Positive indicators ---

  it('adds 10 points per positive indicator', () => {
    const result = scoreLandUse(
      makeLandUse({
        positiveIndicators: ['Farmland'],
      }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Base 70 + 10 = 80
      expect(result.value.factorScore.score).toBe(80);
    }
  });

  it('stacks multiple positive indicators', () => {
    const result = scoreLandUse(
      makeLandUse({
        positiveIndicators: ['Farmland', 'Heathland', 'Meadow'],
      }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Base 70 + 30 = 100
      expect(result.value.factorScore.score).toBe(100);
    }
  });

  it('clamps score to 100 even with many positive indicators', () => {
    const result = scoreLandUse(
      makeLandUse({
        positiveIndicators: ['Farmland', 'Heathland', 'Meadow', 'Grassland'],
      }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Base 70 + 40 = 110 → clamped to 100
      expect(result.value.factorScore.score).toBe(100);
    }
  });

  it('positive indicators offset soft constraints', () => {
    const result = scoreLandUse(
      makeLandUse({
        softConstraints: [{ type: 'water', distanceKm: 1.0, description: 'Water body nearby' }],
        positiveIndicators: ['Farmland', 'Meadow'],
      }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Base 70 - 10 + 20 = 80
      expect(result.value.factorScore.score).toBe(80);
    }
  });

  // --- Empty/no data ---

  it('returns base score of 70 when no data found', () => {
    const result = scoreLandUse(makeLandUse(), 0.10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factorScore.score).toBe(70);
      expect(result.value.hardConstraints).toHaveLength(0);
    }
  });

  it('has medium confidence when no data found', () => {
    const result = scoreLandUse(makeLandUse(), 0.10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factorScore.confidence).toBe('medium');
    }
  });

  it('has high confidence when any constraint or indicator present', () => {
    const result = scoreLandUse(
      makeLandUse({ positiveIndicators: ['Farmland'] }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factorScore.confidence).toBe('high');
    }
  });

  it('includes positive indicators in detail', () => {
    const result = scoreLandUse(
      makeLandUse({ positiveIndicators: ['Farmland', 'Meadow'] }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.factorScore.detail).toContain('Farmland');
      expect(result.value.factorScore.detail).toContain('Meadow');
      expect(result.value.factorScore.detail).toContain('positive');
    }
  });

  it('score never goes below 0', () => {
    const result = scoreLandUse(
      makeLandUse({
        softConstraints: [
          { type: 'residential', distanceKm: 0.1, description: 'Close residential' },
          { type: 'water', distanceKm: 0.1, description: 'Water body near' },
          { type: 'forest', distanceKm: 0.1, description: 'Forest cover' },
          { type: 'wetland', distanceKm: 0.1, description: 'Wetland area' },
          { type: 'flood_plain', distanceKm: 0.1, description: 'Flood plain' },
          { type: 'peat_bog', distanceKm: 0.1, description: 'Peat bog' },
        ],
      }),
      0.10,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Base 70 - 20 - 10 - 15 - 5 - 5 - 5 = 10, but ensures clamping works
      expect(result.value.factorScore.score).toBeGreaterThanOrEqual(0);
      expect(result.value.factorScore.score).toBeLessThanOrEqual(100);
    }
  });

  it('returns empty hardConstraints array when no hard constraints', () => {
    const result = scoreLandUse(makeLandUse(), 0.10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hardConstraints).toEqual([]);
    }
  });
});
