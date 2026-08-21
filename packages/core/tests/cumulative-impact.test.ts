import { describe, it, expect } from 'vitest';
import { assessCumulativeImpact } from '../src/cumulative/cumulative-impact.js';
import type { ExistingTurbine } from '../src/cumulative/cumulative-impact.js';
import type { TurbinePosition } from '../src/types/wake.js';
import type { LatLng } from '../src/types/analysis.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProposedTurbine(id: number, lat: number, lng: number): TurbinePosition {
  return { id, location: { lat, lng }, hubHeightM: 80, rotorDiameterM: 100 };
}

function makeExistingTurbine(id: number, lat: number, lng: number): ExistingTurbine {
  return {
    id,
    location: { lat, lng },
    hubHeightM: 80,
    rotorDiameterM: 90,
    soundPowerLevelDba: 104,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cumulative Impact Assessment', () => {
  const receptor: LatLng = { lat: 55.85, lng: -4.28 };

  it('returns valid structure with no existing turbines (baseline)', () => {
    const proposed = [makeProposedTurbine(1, 55.84, -4.26), makeProposedTurbine(2, 55.84, -4.25)];

    const result = assessCumulativeImpact(proposed, [], [receptor]);

    expect(result.existingTurbineCount).toBe(0);
    expect(result.cumulativeNoise).toHaveLength(1);
    expect(result.proposedNoise).toHaveLength(1);
    expect(result.cumulativeFlicker.receptors).toHaveLength(1);
    expect(result.proposedFlicker.receptors).toHaveLength(1);
    expect(result.cumulativeVisibility).toBeNull(); // no elevation grid
    expect(result.summary).toContain('0 existing');
  });

  it('cumulative noise is higher than proposed-only noise', () => {
    const proposed = [makeProposedTurbine(1, 55.84, -4.28)];
    const existing = [makeExistingTurbine(100, 55.845, -4.28)]; // close to receptor

    const result = assessCumulativeImpact(proposed, existing, [receptor]);

    // With the existing turbine closer, cumulative noise should be higher
    expect(result.cumulativeNoise[0]!.predictedLevelDba).toBeGreaterThanOrEqual(
      result.proposedNoise[0]!.predictedLevelDba,
    );
    expect(result.existingTurbineCount).toBe(1);
  });

  it('cumulative flicker includes contributions from existing turbines', () => {
    const proposed = [makeProposedTurbine(1, 55.84, -4.26)];
    const existing = [makeExistingTurbine(100, 55.845, -4.275)]; // another direction

    const result = assessCumulativeImpact(proposed, existing, [receptor]);

    // Cumulative should be >= proposed-only
    expect(result.cumulativeFlicker.worstCaseHoursPerYear).toBeGreaterThanOrEqual(
      result.proposedFlicker.worstCaseHoursPerYear,
    );
  });

  it('handles multiple receptors', () => {
    const proposed = [makeProposedTurbine(1, 55.84, -4.26)];
    const receptors: LatLng[] = [
      { lat: 55.85, lng: -4.28 },
      { lat: 55.83, lng: -4.27 },
    ];

    const result = assessCumulativeImpact(proposed, [], receptors);

    expect(result.cumulativeNoise).toHaveLength(2);
    expect(result.proposedNoise).toHaveLength(2);
    expect(result.cumulativeFlicker.receptors).toHaveLength(2);
  });

  it('receptor at midpoint between proposed and existing', () => {
    // Place receptor between two turbines
    const proposed = [makeProposedTurbine(1, 55.84, -4.26)];
    const existing = [makeExistingTurbine(100, 55.86, -4.26)];
    const midReceptor: LatLng = { lat: 55.85, lng: -4.26 }; // equidistant

    const result = assessCumulativeImpact(proposed, existing, [midReceptor]);

    // Both turbines contribute roughly equally
    expect(result.cumulativeNoise[0]!.contributions.length).toBe(2);
    expect(result.cumulativeNoise[0]!.predictedLevelDba).toBeGreaterThan(0);
  });

  it('summary includes noise increase when existing turbines present', () => {
    const proposed = [makeProposedTurbine(1, 55.84, -4.28)];
    const existing = [makeExistingTurbine(100, 55.845, -4.28)];

    const result = assessCumulativeImpact(proposed, existing, [receptor]);

    expect(result.summary).toContain('1 existing');
    expect(result.summary).toContain('1 proposed');
    expect(result.summary).toContain('dBA');
  });

  it('handles many existing turbines', () => {
    const proposed = [makeProposedTurbine(1, 55.84, -4.26)];
    const existing = Array.from({ length: 5 }, (_, i) =>
      makeExistingTurbine(100 + i, 55.83 + i * 0.005, -4.25),
    );

    const result = assessCumulativeImpact(proposed, existing, [receptor]);

    expect(result.existingTurbineCount).toBe(5);
    expect(result.cumulativeNoise[0]!.contributions.length).toBe(6); // 1 proposed + 5 existing
  });
});
