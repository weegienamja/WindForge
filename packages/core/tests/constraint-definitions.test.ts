import { describe, it, expect } from 'vitest';
import {
  CONSTRAINT_DEFINITIONS,
  getConstraintDefinition,
  getMaxSetbackKm,
} from '../src/constraints/constraint-definitions.js';

describe('CONSTRAINT_DEFINITIONS', () => {
  it('has at least 10 constraint definitions', () => {
    expect(CONSTRAINT_DEFINITIONS.length).toBeGreaterThanOrEqual(10);
  });

  it('each definition has required properties', () => {
    for (const def of CONSTRAINT_DEFINITIONS) {
      expect(def.id).toBeTruthy();
      expect(def.name).toBeTruthy();
      expect(def.severity).toMatch(/^(hard|soft|info)$/);
      expect(def.category).toBeTruthy();
      expect(def.description).toBeTruthy();
    }
  });

  it('has unique IDs', () => {
    const ids = CONSTRAINT_DEFINITIONS.map((d) => d.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('includes known constraint types', () => {
    const ids = CONSTRAINT_DEFINITIONS.map((d) => d.id);
    expect(ids).toContain('dwelling');
    expect(ids).toContain('airport');
    expect(ids).toContain('nature_reserve');
  });
});

describe('getConstraintDefinition', () => {
  it('returns the correct definition for a known ID', () => {
    const def = getConstraintDefinition('dwelling');
    expect(def).not.toBeNull();
    expect(def?.name).toContain('Dwelling');
  });

  it('returns undefined for unknown ID', () => {
    expect(getConstraintDefinition('nonexistent')).toBeUndefined();
  });

  it('finds airport with correct setback', () => {
    const def = getConstraintDefinition('airport');
    expect(def).not.toBeNull();
    expect(def?.defaultSetbackM).toBe(5000);
  });
});

describe('getMaxSetbackKm', () => {
  it('returns a positive value', () => {
    const max = getMaxSetbackKm();
    expect(max).toBeGreaterThan(0);
  });

  it('returns value in km (airport is 5km)', () => {
    const max = getMaxSetbackKm();
    expect(max).toBeGreaterThanOrEqual(5);
  });
});
