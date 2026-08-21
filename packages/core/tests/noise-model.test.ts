import { describe, it, expect } from 'vitest';
import {
  calculateNoiseAtReceptor,
  calculateNoiseSingleTurbine,
  logarithmicSum,
  geometricDivergence,
  atmosphericAbsorption,
  groundEffect,
  barrierAttenuation,
  slantDistance,
} from '../src/noise/noise-propagation';
import {
  assessNoiseCompliance,
  daytimeNoiseLimit,
  nightTimeNoiseLimit,
} from '../src/noise/etsu-assessment';
import { computeNoiseContours } from '../src/noise/noise-contours';
import { createElevationProfile, interpolateCoordinates } from '../src/utils/elevation-profile';
import type { LatLng } from '../src/types/analysis';
import type { NoiseResult, BackgroundNoise } from '../src/types/noise';

// ─── Geometric Divergence ───

describe('geometricDivergence', () => {
  it('returns 0 for zero distance', () => {
    expect(geometricDivergence(0)).toBe(0);
  });

  it('increases with distance', () => {
    const d100 = geometricDivergence(100);
    const d500 = geometricDivergence(500);
    const d1000 = geometricDivergence(1000);
    expect(d100).toBeLessThan(d500);
    expect(d500).toBeLessThan(d1000);
  });

  it('gives correct value at 100m (known: ~51.2 dB)', () => {
    // 20*log10(100) + 11.2 = 40 + 11.2 = 51.2
    expect(geometricDivergence(100)).toBeCloseTo(51.2, 1);
  });

  it('gives correct value at 1000m (known: ~71.2 dB)', () => {
    // 20*log10(1000) + 11.2 = 60 + 11.2 = 71.2
    expect(geometricDivergence(1000)).toBeCloseTo(71.2, 1);
  });
});

// ─── Atmospheric Absorption ───

describe('atmosphericAbsorption', () => {
  it('returns 0 at zero distance', () => {
    expect(atmosphericAbsorption(0)).toBe(0);
  });

  it('scales linearly with distance', () => {
    const d1000 = atmosphericAbsorption(1000);
    const d2000 = atmosphericAbsorption(2000);
    expect(d2000).toBeCloseTo(d1000 * 2, 5);
  });

  it('uses default coefficient (~3.66 dB/km)', () => {
    // At 1km: ~3.66 dB
    expect(atmosphericAbsorption(1000)).toBeCloseTo(3.66, 1);
  });
});

// ─── Ground Effect ───

describe('groundEffect', () => {
  it('hard ground: 0 dB', () => {
    expect(groundEffect('hard')).toBe(0);
  });

  it('mixed ground: 1.5 dB', () => {
    expect(groundEffect('mixed')).toBe(1.5);
  });

  it('soft ground: 3.0 dB', () => {
    expect(groundEffect('soft')).toBe(3.0);
  });
});

// ─── Slant Distance ───

describe('slantDistance', () => {
  it('at zero horizontal distance, equals hub height', () => {
    const loc: LatLng = { lat: 55.0, lng: -4.0 };
    const d = slantDistance(loc, loc, 80);
    expect(d).toBeCloseTo(80, 0);
  });

  it('slant distance > horizontal distance when hub height > 0', () => {
    const turbine: LatLng = { lat: 55.0, lng: -4.0 };
    const receptor: LatLng = { lat: 55.001, lng: -4.0 };
    const sD = slantDistance(turbine, receptor, 80);
    // Horizontal distance is ~111m, slant should be sqrt(111^2 + 80^2) ~ 137m
    expect(sD).toBeGreaterThan(100);
  });
});

// ─── Barrier Attenuation ───

describe('barrierAttenuation', () => {
  it('returns 0 with no profile', () => {
    expect(barrierAttenuation(undefined, 80)).toBe(0);
  });

  it('returns 0 with flat terrain (no obstruction)', () => {
    const from: LatLng = { lat: 55.0, lng: -4.0 };
    const to: LatLng = { lat: 55.01, lng: -4.0 };
    const profile = createElevationProfile(from, to, [100, 100, 100, 100, 100]);
    expect(barrierAttenuation(profile, 80)).toBe(0);
  });

  it('returns positive attenuation with hill blocking line of sight', () => {
    const from: LatLng = { lat: 55.0, lng: -4.0 };
    const to: LatLng = { lat: 55.005, lng: -4.0 };
    // Turbine at 100m elevation, receptor at 100m, hill at 200m in the middle
    const profile = createElevationProfile(from, to, [100, 120, 200, 120, 100]);
    const abar = barrierAttenuation(profile, 80, 1.5);
    expect(abar).toBeGreaterThan(0);
  });

  it('is capped at 25 dB', () => {
    const from: LatLng = { lat: 55.0, lng: -4.0 };
    const to: LatLng = { lat: 55.01, lng: -4.0 };
    // Massive hill blocking
    const profile = createElevationProfile(from, to, [0, 0, 500, 0, 0]);
    const abar = barrierAttenuation(profile, 10, 1.5);
    expect(abar).toBeLessThanOrEqual(25);
  });
});

// ─── Logarithmic Sum ───

describe('logarithmicSum', () => {
  it('returns -Infinity for empty array', () => {
    expect(logarithmicSum([])).toBe(-Infinity);
  });

  it('returns the single value for one element', () => {
    expect(logarithmicSum([40])).toBe(40);
  });

  it('two equal sources add ~3 dB', () => {
    const result = logarithmicSum([40, 40]);
    expect(result).toBeCloseTo(43, 0);
  });

  it('dominated source adds <1 dB', () => {
    // 50 dB + 30 dB should be very close to 50 dB
    const result = logarithmicSum([50, 30]);
    expect(result).toBeCloseTo(50, 0);
  });

  it('three identical sources add ~4.8 dB', () => {
    const result = logarithmicSum([40, 40, 40]);
    expect(result).toBeCloseTo(44.8, 0);
  });
});

// ─── Single Turbine Noise ───

describe('calculateNoiseSingleTurbine', () => {
  const turbineLoc: LatLng = { lat: 55.0, lng: -4.0 };
  const receptor500m: LatLng = { lat: 55.0045, lng: -4.0 }; // ~500m north

  it('predicts noise level at receptor', () => {
    const result = calculateNoiseSingleTurbine(turbineLoc, 0, 104, 80, receptor500m);

    // At ~500m, geometric divergence ~65 dB, plus atm + ground
    // Expected: ~104 - 65 - 1.8 - 1.5 = ~35.7 dBA
    expect(result.predictedLevelDba).toBeGreaterThan(25);
    expect(result.predictedLevelDba).toBeLessThan(50);
    expect(result.slantDistanceM).toBeGreaterThan(400);
    expect(result.attenuations.geometricDivergenceDb).toBeGreaterThan(60);
  });

  it('produces lower level with soft ground', () => {
    const hard = calculateNoiseSingleTurbine(turbineLoc, 0, 104, 80, receptor500m, {
      groundType: 'hard',
    });
    const soft = calculateNoiseSingleTurbine(turbineLoc, 0, 104, 80, receptor500m, {
      groundType: 'soft',
    });

    expect(soft.predictedLevelDba).toBeLessThan(hard.predictedLevelDba);
  });
});

// ─── Multi-Turbine Noise ───

describe('calculateNoiseAtReceptor', () => {
  it('combines multiple turbines logarithmically', () => {
    const turbines = [
      { id: 0, location: { lat: 55.0, lng: -4.005 } },
      { id: 1, location: { lat: 55.0, lng: -3.995 } },
    ];
    const receptor: LatLng = { lat: 55.005, lng: -4.0 };

    const result = calculateNoiseAtReceptor(turbines, receptor, 104, 80);

    expect(result.turbineCount).toBe(2);
    expect(result.contributions.length).toBe(2);
    // Combined level should be higher than any single contribution
    const maxSingle = Math.max(...result.contributions.map((c) => c.predictedLevelDba));
    expect(result.predictedLevelDba).toBeGreaterThan(maxSingle);
    // But not by much (logarithmic, at most ~3 dB for two equal sources)
    expect(result.predictedLevelDba).toBeLessThanOrEqual(maxSingle + 3.1);
  });

  it('handles single turbine', () => {
    const turbines = [{ id: 0, location: { lat: 55.0, lng: -4.0 } }];
    const receptor: LatLng = { lat: 55.005, lng: -4.0 };

    const result = calculateNoiseAtReceptor(turbines, receptor, 104, 80);

    expect(result.turbineCount).toBe(1);
    expect(result.predictedLevelDba).toBe(result.contributions[0]!.predictedLevelDba);
  });

  it('accepts array of different SPL values', () => {
    const turbines = [
      { id: 0, location: { lat: 55.0, lng: -4.005 } },
      { id: 1, location: { lat: 55.0, lng: -3.995 } },
    ];
    const receptor: LatLng = { lat: 55.005, lng: -4.0 };

    const result = calculateNoiseAtReceptor(turbines, receptor, [104, 98], 80);

    // The 104 dBA turbine should dominate
    expect(result.contributions[0]!.predictedLevelDba).toBeGreaterThan(
      result.contributions[1]!.predictedLevelDba,
    );
  });

  it('noise decreases with distance', () => {
    const turbines = [{ id: 0, location: { lat: 55.0, lng: -4.0 } }];
    const near: LatLng = { lat: 55.003, lng: -4.0 };
    const far: LatLng = { lat: 55.01, lng: -4.0 };

    const nearResult = calculateNoiseAtReceptor(turbines, near, 104, 80);
    const farResult = calculateNoiseAtReceptor(turbines, far, 104, 80);

    expect(nearResult.predictedLevelDba).toBeGreaterThan(farResult.predictedLevelDba);
  });
});

// ─── ETSU-R-97 Daytime Limit ───

describe('daytimeNoiseLimit', () => {
  it('returns background + 5 when above floor', () => {
    // Background 35 + 5 = 40, floor 35 -> use 40
    expect(daytimeNoiseLimit(35)).toBe(40);
  });

  it('returns floor when background + 5 is below floor', () => {
    // Background 25 + 5 = 30, floor 35 -> use 35
    expect(daytimeNoiseLimit(25)).toBe(35);
  });

  it('uses custom floor', () => {
    expect(daytimeNoiseLimit(25, { quietDaytimeLowerLimitDba: 40 })).toBe(40);
  });

  it('uses custom margin', () => {
    expect(daytimeNoiseLimit(35, { backgroundMarginDba: 10 })).toBe(45);
  });
});

// ─── ETSU-R-97 Night-Time Limit ───

describe('nightTimeNoiseLimit', () => {
  it('returns default 43 dBA', () => {
    expect(nightTimeNoiseLimit()).toBe(43);
  });

  it('returns custom value', () => {
    expect(nightTimeNoiseLimit({ nightTimeLimitDba: 45 })).toBe(45);
  });
});

// ─── ETSU-R-97 Full Assessment ───

describe('assessNoiseCompliance', () => {
  const makeNoiseResult = (lat: number, lng: number, level: number): NoiseResult => ({
    receptor: { lat, lng },
    predictedLevelDba: level,
    contributions: [],
    turbineCount: 1,
  });

  const makeBackground = (
    lat: number,
    lng: number,
    label: string,
    day: number,
    night: number,
  ): BackgroundNoise => ({
    location: { lat, lng },
    label,
    daytimeLevelDba: day,
    nightTimeLevelDba: night,
  });

  it('compliant when predicted level is below all limits', () => {
    const noiseResults = [makeNoiseResult(55.0, -4.0, 30)];
    const backgrounds = [makeBackground(55.0, -4.0, 'Property A', 35, 30)];

    const assessment = assessNoiseCompliance(noiseResults, backgrounds);

    expect(assessment.withinAllScreeningLimits).toBe(true);
    expect(assessment.receptors[0]!.withinDaytimeScreeningLimit).toBe(true);
    expect(assessment.receptors[0]!.withinNightScreeningLimit).toBe(true);
    expect(assessment.receptors[0]!.daytimeMarginDba).toBeGreaterThan(0);
    expect(assessment.receptors[0]!.nightTimeMarginDba).toBeGreaterThan(0);
  });

  it('non-compliant when predicted level exceeds night limit', () => {
    const noiseResults = [makeNoiseResult(55.0, -4.0, 45)];
    const backgrounds = [makeBackground(55.0, -4.0, 'Property B', 35, 30)];

    const assessment = assessNoiseCompliance(noiseResults, backgrounds);

    expect(assessment.withinAllScreeningLimits).toBe(false);
    expect(assessment.receptors[0]!.withinNightScreeningLimit).toBe(false);
    expect(assessment.receptors[0]!.nightTimeMarginDba).toBeLessThan(0);
    expect(assessment.summary).toContain('Above the illustrative');
  });

  it('non-compliant when predicted level exceeds daytime limit', () => {
    // Background 30 + 5 = 35, or floor 35 -> limit is 35
    // Predicted 38 > 35
    const noiseResults = [makeNoiseResult(55.0, -4.0, 38)];
    const backgrounds = [makeBackground(55.0, -4.0, 'Property C', 30, 25)];

    const assessment = assessNoiseCompliance(noiseResults, backgrounds);

    expect(assessment.receptors[0]!.withinDaytimeScreeningLimit).toBe(false);
    expect(assessment.receptors[0]!.daytimeMarginDba).toBeLessThan(0);
  });

  it('handles multiple receptors - mixed compliance', () => {
    const noiseResults = [
      makeNoiseResult(55.0, -4.0, 30), // Compliant
      makeNoiseResult(55.001, -4.0, 45), // Non-compliant (night)
    ];
    const backgrounds = [
      makeBackground(55.0, -4.0, 'Property A', 35, 30),
      makeBackground(55.001, -4.0, 'Property B', 35, 30),
    ];

    const assessment = assessNoiseCompliance(noiseResults, backgrounds);

    expect(assessment.withinAllScreeningLimits).toBe(false);
    expect(assessment.receptors[0]!.withinNightScreeningLimit).toBe(true);
    expect(assessment.receptors[1]!.withinNightScreeningLimit).toBe(false);
    expect(assessment.worstCaseReceptorLabel).toBe('Property B');
  });

  it('uses default background when none provided', () => {
    const noiseResults = [makeNoiseResult(55.0, -4.0, 34)];

    const assessment = assessNoiseCompliance(noiseResults, []);

    // Default background 30 + 5 = 35, floor 35 -> limit 35
    // Predicted 34 < 35 -> compliant
    expect(assessment.withinAllScreeningLimits).toBe(true);
    expect(assessment.receptors[0]!.daytimeMarginDba).toBeCloseTo(1, 0);
  });

  it('returns empty assessment for no receptors', () => {
    const assessment = assessNoiseCompliance([], []);
    expect(assessment.withinAllScreeningLimits).toBe(true);
    expect(assessment.receptors.length).toBe(0);
    expect(assessment.summary).toContain('No receptors assessed');
  });

  it('worst case margin is the most negative value', () => {
    const noiseResults = [
      makeNoiseResult(55.0, -4.0, 44), // 43 - 44 = -1 (night)
      makeNoiseResult(55.001, -4.0, 47), // 43 - 47 = -4 (night, worse)
    ];
    const backgrounds = [
      makeBackground(55.0, -4.0, 'A', 40, 35),
      makeBackground(55.001, -4.0, 'B', 40, 35),
    ];

    const assessment = assessNoiseCompliance(noiseResults, backgrounds);

    expect(assessment.worstCaseMarginDba).toBeLessThan(-3);
    expect(assessment.worstCaseReceptorLabel).toBe('B');
  });
});

// ─── Noise Contours ───

describe('computeNoiseContours', () => {
  it('returns empty grid for no turbines', () => {
    const grid = computeNoiseContours([], 80);
    expect(grid.cells.length).toBe(0);
  });

  it('generates cells for a single turbine', () => {
    const turbines = [{ id: 0, location: { lat: 55.0, lng: -4.0 }, soundPowerLevelDba: 104 }];
    const grid = computeNoiseContours(turbines, 80, 200, 1000);

    expect(grid.cells.length).toBeGreaterThan(0);
    expect(grid.maxLevelDba).toBeGreaterThan(grid.minLevelDba);
    expect(grid.gridSpacingM).toBe(200);
  });

  it('highest noise is near the turbine', () => {
    const turbines = [{ id: 0, location: { lat: 55.0, lng: -4.0 }, soundPowerLevelDba: 104 }];
    const grid = computeNoiseContours(turbines, 80, 200, 1000);

    // Find the cell closest to the turbine
    let closest = grid.cells[0]!;
    let minDist = Infinity;
    for (const cell of grid.cells) {
      const d = Math.sqrt((cell.lat - 55.0) ** 2 + (cell.lng + 4.0) ** 2);
      if (d < minDist) {
        minDist = d;
        closest = cell;
      }
    }

    expect(closest.levelDba).toBeCloseTo(grid.maxLevelDba, 1);
  });

  it('identifies standard contour levels', () => {
    const turbines = [{ id: 0, location: { lat: 55.0, lng: -4.0 }, soundPowerLevelDba: 104 }];
    const grid = computeNoiseContours(turbines, 80, 100, 2000);

    // Grid should cross at least the 40 dBA and 35 dBA contours
    expect(grid.contourLevelsDba.length).toBeGreaterThan(0);
  });
});

// ─── Elevation Profile Utility ───

describe('interpolateCoordinates', () => {
  it('returns start point for numPoints < 2', () => {
    const from: LatLng = { lat: 55.0, lng: -4.0 };
    const to: LatLng = { lat: 55.01, lng: -4.0 };
    const result = interpolateCoordinates(from, to, 1);
    expect(result.length).toBe(1);
    expect(result[0]!.lat).toBe(55.0);
  });

  it('includes start and end points', () => {
    const from: LatLng = { lat: 55.0, lng: -4.0 };
    const to: LatLng = { lat: 55.01, lng: -4.0 };
    const result = interpolateCoordinates(from, to, 5);
    expect(result.length).toBe(5);
    expect(result[0]!.lat).toBeCloseTo(55.0);
    expect(result[4]!.lat).toBeCloseTo(55.01);
  });

  it('midpoint is correct', () => {
    const from: LatLng = { lat: 55.0, lng: -4.0 };
    const to: LatLng = { lat: 55.1, lng: -3.8 };
    const result = interpolateCoordinates(from, to, 3);
    expect(result[1]!.lat).toBeCloseTo(55.05);
    expect(result[1]!.lng).toBeCloseTo(-3.9);
  });
});

describe('createElevationProfile', () => {
  it('creates profile from elevation array', () => {
    const from: LatLng = { lat: 55.0, lng: -4.0 };
    const to: LatLng = { lat: 55.01, lng: -4.0 };
    const profile = createElevationProfile(from, to, [100, 120, 150, 130, 100]);

    expect(profile.points.length).toBe(5);
    expect(profile.totalDistanceM).toBeGreaterThan(1000);
    expect(profile.points[0]!.distanceM).toBe(0);
    expect(profile.points[4]!.distanceM).toBeCloseTo(profile.totalDistanceM);
    expect(profile.points[2]!.elevationM).toBe(150);
  });
});

// ─── Turbine Library Sound Power Levels ───

describe('turbine library noise data', () => {
  it('all turbines have sound power levels', async () => {
    const { getAllTurbines } = await import('../src/turbines/turbine-library');
    const turbines = getAllTurbines();

    for (const t of turbines) {
      expect(t.soundPowerLevelDba).toBeDefined();
      expect(t.soundPowerLevelDba).toBeGreaterThan(90);
      expect(t.soundPowerLevelDba).toBeLessThan(115);
    }
  });
});
