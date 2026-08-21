import { describe, it, expect } from 'vitest';
import {
  jensenSingleWake,
  combinedWakeDeficit,
  computeJensenWakeField,
  wakeDecayFromRoughness,
  interpolateThrustCoefficient,
  generateThrustCurveFromPower,
  windAlignedDistance,
} from '../src/wake/jensen-wake';
import {
  bastankhahSingleWake,
  bastankhahExpansionFromRoughness,
  computeBastankhahWakeField,
} from '../src/wake/bastankhah-wake';
import {
  calculateDirectionalWakeLoss,
  buildWindRose,
  layoutToTurbinePositions,
} from '../src/wake/wake-loss-calculator';
import type { TurbinePosition } from '../src/types/wake';
import type { ThrustCurvePoint } from '../src/types/turbines';
import type { WindDataSummary } from '../src/types/datasources';
import { getAllTurbines } from '../src/turbines/turbine-library';

// --- Helper data ---

const SIMPLE_THRUST_CURVE: ThrustCurvePoint[] = [
  { windSpeedMs: 0, thrustCoefficient: 0 },
  { windSpeedMs: 3, thrustCoefficient: 0 },
  { windSpeedMs: 4, thrustCoefficient: 0.82 },
  { windSpeedMs: 6, thrustCoefficient: 0.8 },
  { windSpeedMs: 8, thrustCoefficient: 0.78 },
  { windSpeedMs: 10, thrustCoefficient: 0.75 },
  { windSpeedMs: 12, thrustCoefficient: 0.4 },
  { windSpeedMs: 15, thrustCoefficient: 0.2 },
  { windSpeedMs: 20, thrustCoefficient: 0.1 },
  { windSpeedMs: 25, thrustCoefficient: 0.05 },
];

function makeTurbinePosition(id: number, lat: number, lng: number): TurbinePosition {
  return { id, location: { lat, lng }, hubHeightM: 80, rotorDiameterM: 126 };
}

function makeWindData(overrides?: Partial<WindDataSummary>): WindDataSummary {
  const monthlyAverages = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    averageSpeedMs: 7.5 + Math.sin((i * Math.PI) / 6),
    averageDirectionDeg: 270,
  }));
  return {
    coordinate: { lat: 55.86, lng: -4.25 },
    monthlyAverages,
    annualAverageSpeedMs: 7.5,
    speedStdDevMs: 3.2,
    prevailingDirectionDeg: 270,
    directionalConsistency: 0.7,
    dataYears: 10,
    referenceHeightM: 50,
    ...overrides,
  };
}

// ─── Jensen single wake ───

describe('jensenSingleWake', () => {
  it('returns zero deficit when downwind distance is zero or negative', () => {
    const r = jensenSingleWake(0.8, 63, 0, 0, 63, 0.075);
    expect(r.velocityDeficit).toBe(0);
    expect(r.overlapFraction).toBe(0);

    const r2 = jensenSingleWake(0.8, 63, -100, 0, 63, 0.075);
    expect(r2.velocityDeficit).toBe(0);
  });

  it('returns zero deficit when thrust coefficient is zero', () => {
    const r = jensenSingleWake(0, 63, 500, 0, 63, 0.075);
    expect(r.velocityDeficit).toBe(0);
  });

  it('computes deficit that decreases with distance', () => {
    const close = jensenSingleWake(0.8, 63, 300, 0, 63, 0.075);
    const mid = jensenSingleWake(0.8, 63, 700, 0, 63, 0.075);
    const far = jensenSingleWake(0.8, 63, 1500, 0, 63, 0.075);

    expect(close.velocityDeficit).toBeGreaterThan(mid.velocityDeficit);
    expect(mid.velocityDeficit).toBeGreaterThan(far.velocityDeficit);
    expect(far.velocityDeficit).toBeGreaterThan(0);
  });

  it('computes full overlap when downstream turbine is on centreline', () => {
    const r = jensenSingleWake(0.8, 63, 500, 0, 63, 0.075);
    expect(r.overlapFraction).toBeGreaterThan(0.9);
    expect(r.velocityDeficit).toBeGreaterThan(0);
  });

  it('returns zero deficit when crosswind offset exceeds wake radius', () => {
    // Wake radius at 500m with k=0.075: r = 63 + 0.075*500 = 100.5m
    // If crosswind offset > 100.5 + 63 = 163.5m, no overlap
    const r = jensenSingleWake(0.8, 63, 500, 200, 63, 0.075);
    expect(r.velocityDeficit).toBe(0);
    expect(r.overlapFraction).toBe(0);
  });

  it('produces partial overlap at intermediate crosswind offset', () => {
    // Wake radius at 500m with k=0.075: r = 100.5m
    // Crosswind offset at 80m: partial overlap
    const r = jensenSingleWake(0.8, 63, 500, 80, 63, 0.075);
    expect(r.overlapFraction).toBeGreaterThan(0);
    expect(r.overlapFraction).toBeLessThan(1);
    expect(r.velocityDeficit).toBeGreaterThan(0);
  });

  it('larger wake decay constant means faster recovery', () => {
    const lowK = jensenSingleWake(0.8, 63, 700, 0, 63, 0.04);
    const highK = jensenSingleWake(0.8, 63, 700, 0, 63, 0.1);

    // Higher k = larger wake radius = more diluted = lower deficit
    expect(highK.velocityDeficit).toBeLessThan(lowK.velocityDeficit);
  });

  it('deficit is bounded between 0 and 1', () => {
    const r = jensenSingleWake(0.999, 63, 100, 0, 63, 0.01);
    expect(r.velocityDeficit).toBeGreaterThanOrEqual(0);
    expect(r.velocityDeficit).toBeLessThanOrEqual(1);
  });
});

// ─── Combined wake deficit (RSS) ───

describe('combinedWakeDeficit', () => {
  it('returns 0 for empty array', () => {
    expect(combinedWakeDeficit([])).toBe(0);
  });

  it('returns the single deficit for single-element array', () => {
    expect(combinedWakeDeficit([0.15])).toBeCloseTo(0.15);
  });

  it('computes RSS correctly for two deficits', () => {
    const result = combinedWakeDeficit([0.3, 0.4]);
    expect(result).toBeCloseTo(0.5); // sqrt(0.09 + 0.16) = 0.5
  });

  it('is capped at 0.99', () => {
    const result = combinedWakeDeficit([0.8, 0.8, 0.8]);
    expect(result).toBeLessThanOrEqual(0.99);
  });
});

// ─── Wind-aligned distance ───

describe('windAlignedDistance', () => {
  it('turbine directly north of upstream with south wind is downstream', () => {
    const up = { lat: 55.0, lng: -4.0 };
    const down = { lat: 55.01, lng: -4.0 };
    // Wind from south (180 deg) - flows north
    const { downwindM, crosswindM } = windAlignedDistance(up, down, 180);
    expect(downwindM).toBeGreaterThan(0); // downstream
    expect(crosswindM).toBeLessThan(50); // nearly zero crosswind
  });

  it('turbine directly south of upstream with south wind is upstream (negative downwind)', () => {
    const up = { lat: 55.0, lng: -4.0 };
    const before = { lat: 54.99, lng: -4.0 };
    // Wind from south - flows north
    const { downwindM } = windAlignedDistance(up, before, 180);
    expect(downwindM).toBeLessThan(0);
  });

  it('turbine directly east with west wind is downstream', () => {
    const up = { lat: 55.0, lng: -4.0 };
    const down = { lat: 55.0, lng: -3.99 };
    // Wind from west (270 deg) - flows east
    const { downwindM, crosswindM } = windAlignedDistance(up, down, 270);
    expect(downwindM).toBeGreaterThan(0);
    expect(crosswindM).toBeLessThan(50);
  });
});

// ─── Thrust coefficient interpolation ───

describe('interpolateThrustCoefficient', () => {
  it('returns 0 for empty curve', () => {
    expect(interpolateThrustCoefficient([], 10)).toBe(0);
  });

  it('returns first value for speed below curve start', () => {
    expect(interpolateThrustCoefficient(SIMPLE_THRUST_CURVE, 1)).toBe(0);
  });

  it('returns last value for speed above curve end', () => {
    expect(interpolateThrustCoefficient(SIMPLE_THRUST_CURVE, 30)).toBe(0.05);
  });

  it('interpolates between points', () => {
    const ct = interpolateThrustCoefficient(SIMPLE_THRUST_CURVE, 7);
    expect(ct).toBeGreaterThan(0.78);
    expect(ct).toBeLessThan(0.8);
  });

  it('returns exact value at a point', () => {
    expect(interpolateThrustCoefficient(SIMPLE_THRUST_CURVE, 10)).toBe(0.75);
  });
});

// ─── Generate thrust curve from power ───

describe('generateThrustCurveFromPower', () => {
  it('generates thrust curve from power curve', () => {
    const powerCurve = [
      { windSpeedMs: 0, powerKw: 0 },
      { windSpeedMs: 3, powerKw: 0 },
      { windSpeedMs: 5, powerKw: 100 },
      { windSpeedMs: 8, powerKw: 800 },
      { windSpeedMs: 12, powerKw: 2000 },
      { windSpeedMs: 15, powerKw: 2000 },
      { windSpeedMs: 25, powerKw: 2000 },
    ];

    const thrust = generateThrustCurveFromPower(powerCurve, 90);
    expect(thrust.length).toBe(powerCurve.length);

    // Zero power should give zero Ct
    expect(thrust[0]!.thrustCoefficient).toBe(0);
    expect(thrust[1]!.thrustCoefficient).toBe(0);

    // Non-zero power should give positive Ct
    const operatingPoints = thrust.filter((t) => t.thrustCoefficient > 0);
    expect(operatingPoints.length).toBeGreaterThan(0);

    // Ct should be between 0 and 1
    for (const point of thrust) {
      expect(point.thrustCoefficient).toBeGreaterThanOrEqual(0);
      expect(point.thrustCoefficient).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Wake decay from roughness ───

describe('wakeDecayFromRoughness', () => {
  it('returns correct values for known roughness classes', () => {
    expect(wakeDecayFromRoughness(0)).toBe(0.04);
    expect(wakeDecayFromRoughness(1)).toBe(0.06);
    expect(wakeDecayFromRoughness(2)).toBe(0.075);
    expect(wakeDecayFromRoughness(3)).toBe(0.1);
  });

  it('returns default for unknown roughness class', () => {
    expect(wakeDecayFromRoughness(5)).toBe(0.075);
  });
});

// ─── Jensen wake field ───

describe('computeJensenWakeField', () => {
  it('returns free-stream speed for a single turbine', () => {
    const turbines = [makeTurbinePosition(0, 55.0, -4.0)];
    const { effectiveSpeedMs } = computeJensenWakeField(
      turbines,
      8,
      270,
      SIMPLE_THRUST_CURVE,
      0.075,
    );
    expect(effectiveSpeedMs[0]).toBe(8);
  });

  it('downstream turbine has reduced speed in 2-turbine inline layout', () => {
    // Two turbines aligned with wind direction (west wind)
    const turbines = [
      makeTurbinePosition(0, 55.0, -4.01), // upstream (west)
      makeTurbinePosition(1, 55.0, -3.99), // downstream (east)
    ];
    const { effectiveSpeedMs } = computeJensenWakeField(
      turbines,
      8,
      270,
      SIMPLE_THRUST_CURVE,
      0.075,
    );
    expect(effectiveSpeedMs[0]).toBe(8); // upstream unaffected
    expect(effectiveSpeedMs[1]).toBeLessThan(8); // downstream has wake
    expect(effectiveSpeedMs[1]).toBeGreaterThan(4); // not unreasonably low
  });

  it('crosswind turbine is not affected by wake', () => {
    // Two turbines perpendicular to wind
    const turbines = [
      makeTurbinePosition(0, 55.0, -4.0),
      makeTurbinePosition(1, 55.005, -4.0), // due north
    ];
    // Wind from west (270) - both should be unaffected
    const { effectiveSpeedMs } = computeJensenWakeField(
      turbines,
      8,
      270,
      SIMPLE_THRUST_CURVE,
      0.075,
    );
    expect(effectiveSpeedMs[0]).toBe(8);
    expect(effectiveSpeedMs[1]).toBe(8);
  });

  it('handles three inline turbines with cumulative wake', () => {
    const spacing = 0.008; // ~560m at 55N
    const turbines = [
      makeTurbinePosition(0, 55.0, -4.0 - spacing),
      makeTurbinePosition(1, 55.0, -4.0),
      makeTurbinePosition(2, 55.0, -4.0 + spacing),
    ];
    // Wind from west
    const { effectiveSpeedMs } = computeJensenWakeField(
      turbines,
      8,
      270,
      SIMPLE_THRUST_CURVE,
      0.075,
    );
    // Each downstream turbine should be progressively slower
    expect(effectiveSpeedMs[0]).toBe(8);
    expect(effectiveSpeedMs[1]).toBeLessThan(effectiveSpeedMs[0]!);
    expect(effectiveSpeedMs[2]).toBeLessThan(effectiveSpeedMs[1]!);
  });
});

// ─── Bastankhah single wake ───

describe('bastankhahSingleWake', () => {
  it('returns zero deficit for zero or negative downwind distance', () => {
    expect(bastankhahSingleWake(0.8, 126, 0, 0, 0.04).velocityDeficit).toBe(0);
    expect(bastankhahSingleWake(0.8, 126, -100, 0, 0.04).velocityDeficit).toBe(0);
  });

  it('returns zero deficit for zero Ct', () => {
    expect(bastankhahSingleWake(0, 126, 500, 0, 0.04).velocityDeficit).toBe(0);
  });

  it('deficit decreases with distance', () => {
    const close = bastankhahSingleWake(0.8, 126, 300, 0, 0.04);
    const mid = bastankhahSingleWake(0.8, 126, 700, 0, 0.04);
    const far = bastankhahSingleWake(0.8, 126, 1500, 0, 0.04);

    expect(close.velocityDeficit).toBeGreaterThan(mid.velocityDeficit);
    expect(mid.velocityDeficit).toBeGreaterThan(far.velocityDeficit);
  });

  it('deficit is highest on centreline and decreases with crosswind offset', () => {
    const centre = bastankhahSingleWake(0.8, 126, 700, 0, 0.04);
    const offset = bastankhahSingleWake(0.8, 126, 700, 50, 0.04);
    const farOffset = bastankhahSingleWake(0.8, 126, 700, 200, 0.04);

    expect(centre.velocityDeficit).toBeGreaterThan(offset.velocityDeficit);
    expect(offset.velocityDeficit).toBeGreaterThan(farOffset.velocityDeficit);
  });

  it('deficit is bounded between 0 and 1', () => {
    const r = bastankhahSingleWake(0.999, 126, 100, 0, 0.04);
    expect(r.velocityDeficit).toBeGreaterThanOrEqual(0);
    expect(r.velocityDeficit).toBeLessThanOrEqual(1);
  });
});

// ─── Bastankhah expansion from roughness ───

describe('bastankhahExpansionFromRoughness', () => {
  it('returns correct values for known roughness classes', () => {
    expect(bastankhahExpansionFromRoughness(0)).toBe(0.022);
    expect(bastankhahExpansionFromRoughness(1)).toBe(0.03);
    expect(bastankhahExpansionFromRoughness(2)).toBe(0.04);
    expect(bastankhahExpansionFromRoughness(3)).toBe(0.05);
  });
});

// ─── Bastankhah wake field ───

describe('computeBastankhahWakeField', () => {
  it('downstream turbine has reduced speed in 2-turbine inline layout', () => {
    const turbines = [makeTurbinePosition(0, 55.0, -4.01), makeTurbinePosition(1, 55.0, -3.99)];
    const { effectiveSpeedMs } = computeBastankhahWakeField(
      turbines,
      8,
      270,
      SIMPLE_THRUST_CURVE,
      0.04,
    );
    expect(effectiveSpeedMs[0]).toBe(8);
    expect(effectiveSpeedMs[1]).toBeLessThan(8);
    expect(effectiveSpeedMs[1]).toBeGreaterThan(4);
  });
});

// ─── Build wind rose ───

describe('buildWindRose', () => {
  it('builds a valid wind rose from wind data', () => {
    const windData = makeWindData();
    const rose = buildWindRose(windData, 12);

    expect(rose.length).toBe(12);
    const totalFreq = rose.reduce((s, r) => s + r.frequency, 0);
    expect(totalFreq).toBeCloseTo(1.0, 3);

    for (const sector of rose) {
      expect(sector.meanSpeedMs).toBeGreaterThan(0);
      expect(sector.frequency).toBeGreaterThanOrEqual(0);
      expect(sector.directionDeg).toBeGreaterThanOrEqual(0);
      expect(sector.directionDeg).toBeLessThan(360);
    }
  });

  it('handles uniform wind direction distributing to one sector', () => {
    const windData = makeWindData({
      monthlyAverages: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        averageSpeedMs: 7.5,
        averageDirectionDeg: 270,
      })),
    });
    const rose = buildWindRose(windData, 12);

    // Sector at exactly 270 deg should have the highest frequency
    const wSector = rose.find((r) => r.directionDeg === 270);
    expect(wSector).toBeDefined();
    // All 12 months map to this sector, so it should dominate
    const maxFreq = Math.max(...rose.map((r) => r.frequency));
    expect(wSector!.frequency).toBe(maxFreq);
    expect(wSector!.frequency).toBeGreaterThan(0.5);
  });

  it('defaults to 36 sectors', () => {
    const rose = buildWindRose(makeWindData());
    expect(rose.length).toBe(36);
  });
});

// ─── Layout to turbine positions ───

describe('layoutToTurbinePositions', () => {
  it('converts layout positions correctly', () => {
    const turbine = getAllTurbines()[0]!;
    const positions = [
      { lat: 55.0, lng: -4.0 },
      { lat: 55.01, lng: -4.01 },
    ];
    const result = layoutToTurbinePositions(positions, turbine, 100);

    expect(result.length).toBe(2);
    expect(result[0]!.id).toBe(0);
    expect(result[1]!.id).toBe(1);
    expect(result[0]!.hubHeightM).toBe(100);
    expect(result[0]!.rotorDiameterM).toBe(turbine.rotorDiameterM);
  });
});

// ─── Directional wake loss calculator ───

describe('calculateDirectionalWakeLoss', () => {
  const turbine = getAllTurbines().find((t) => t.id === 'vestas-v90-2000')!;

  it('returns zero wake loss for single turbine', () => {
    const layout = [makeTurbinePosition(0, 55.0, -4.0)];
    layout[0]!.rotorDiameterM = turbine.rotorDiameterM;
    const result = calculateDirectionalWakeLoss(layout, turbine, makeWindData());

    expect(result.wakeLossPercent).toBe(0);
    expect(result.farmEfficiency).toBe(1);
    expect(result.perTurbineResults.length).toBe(1);
  });

  it('returns zero wake loss for empty layout', () => {
    const result = calculateDirectionalWakeLoss([], turbine, makeWindData());
    expect(result.wakeLossPercent).toBe(0);
    expect(result.grossFarmAepMwh).toBe(0);
  });

  it('computes non-zero wake loss for 2-turbine inline layout', () => {
    const layout = [
      { id: 0, location: { lat: 55.0, lng: -4.01 }, hubHeightM: 80, rotorDiameterM: 90 },
      { id: 1, location: { lat: 55.0, lng: -3.99 }, hubHeightM: 80, rotorDiameterM: 90 },
    ];
    const windData = makeWindData({
      monthlyAverages: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        averageSpeedMs: 8,
        averageDirectionDeg: 270, // All wind from west
      })),
    });

    const result = calculateDirectionalWakeLoss(layout, turbine, windData, 'jensen');

    expect(result.wakeLossPercent).toBeGreaterThan(0);
    expect(result.wakeLossPercent).toBeLessThan(50);
    expect(result.farmEfficiency).toBeGreaterThan(0.5);
    expect(result.farmEfficiency).toBeLessThan(1);
    expect(result.grossFarmAepMwh).toBeGreaterThan(result.wakeAdjustedFarmAepMwh);
    expect(result.summary).toContain('Jensen/Park');
  });

  it('bastankhah model also computes wake losses', () => {
    const layout = [
      { id: 0, location: { lat: 55.0, lng: -4.01 }, hubHeightM: 80, rotorDiameterM: 90 },
      { id: 1, location: { lat: 55.0, lng: -3.99 }, hubHeightM: 80, rotorDiameterM: 90 },
    ];
    const result = calculateDirectionalWakeLoss(layout, turbine, makeWindData(), 'bastankhah');

    expect(result.wakeLossPercent).toBeGreaterThan(0);
    expect(result.model).toBe('bastankhah');
    expect(result.summary).toContain('Bastankhah');
  });

  it('staggered layout has less wake loss than inline layout', () => {
    const inline = [
      { id: 0, location: { lat: 55.0, lng: -4.006 }, hubHeightM: 80, rotorDiameterM: 90 },
      { id: 1, location: { lat: 55.0, lng: -4.0 }, hubHeightM: 80, rotorDiameterM: 90 },
      { id: 2, location: { lat: 55.0, lng: -3.994 }, hubHeightM: 80, rotorDiameterM: 90 },
    ];

    const staggered = [
      { id: 0, location: { lat: 55.0, lng: -4.006 }, hubHeightM: 80, rotorDiameterM: 90 },
      { id: 1, location: { lat: 55.003, lng: -4.0 }, hubHeightM: 80, rotorDiameterM: 90 },
      { id: 2, location: { lat: 55.0, lng: -3.994 }, hubHeightM: 80, rotorDiameterM: 90 },
    ];

    const windData = makeWindData({
      monthlyAverages: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        averageSpeedMs: 8,
        averageDirectionDeg: 270,
      })),
    });

    const inlineResult = calculateDirectionalWakeLoss(inline, turbine, windData, 'jensen');
    const staggeredResult = calculateDirectionalWakeLoss(staggered, turbine, windData, 'jensen');

    // Staggered layout should have less wake loss
    expect(staggeredResult.wakeLossPercent).toBeLessThan(inlineResult.wakeLossPercent);
  });

  it('per-turbine results are populated', () => {
    const layout = [
      { id: 0, location: { lat: 55.0, lng: -4.01 }, hubHeightM: 80, rotorDiameterM: 90 },
      { id: 1, location: { lat: 55.0, lng: -3.99 }, hubHeightM: 80, rotorDiameterM: 90 },
    ];

    const result = calculateDirectionalWakeLoss(layout, turbine, makeWindData(), 'jensen');

    expect(result.perTurbineResults.length).toBe(2);
    for (const tr of result.perTurbineResults) {
      expect(tr.freeStreamAepMwh).toBeGreaterThan(0);
      expect(tr.wakeAdjustedAepMwh).toBeGreaterThan(0);
      expect(tr.efficiency).toBeGreaterThan(0);
      expect(tr.efficiency).toBeLessThanOrEqual(1);
    }
  });

  it('respects roughness class for wake decay', () => {
    const layout = [
      { id: 0, location: { lat: 55.0, lng: -4.01 }, hubHeightM: 80, rotorDiameterM: 90 },
      { id: 1, location: { lat: 55.0, lng: -3.99 }, hubHeightM: 80, rotorDiameterM: 90 },
    ];

    const offshoreResult = calculateDirectionalWakeLoss(layout, turbine, makeWindData(), 'jensen', {
      roughnessClass: 0,
    });
    const onshoreResult = calculateDirectionalWakeLoss(layout, turbine, makeWindData(), 'jensen', {
      roughnessClass: 2,
    });

    // Both should have different wake decay constants
    expect(offshoreResult.wakeDecayConstant).toBeLessThan(onshoreResult.wakeDecayConstant);
  });
});

// ─── Jensen vs Bastankhah comparison ───

describe('Jensen vs Bastankhah comparison', () => {
  it('both models produce wake losses in the same ballpark', () => {
    const turbine = getAllTurbines().find((t) => t.id === 'vestas-v90-2000')!;
    const layout = [
      { id: 0, location: { lat: 55.0, lng: -4.01 }, hubHeightM: 80, rotorDiameterM: 90 },
      { id: 1, location: { lat: 55.0, lng: -3.99 }, hubHeightM: 80, rotorDiameterM: 90 },
    ];
    const windData = makeWindData();

    const jensen = calculateDirectionalWakeLoss(layout, turbine, windData, 'jensen');
    const bastankhah = calculateDirectionalWakeLoss(layout, turbine, windData, 'bastankhah');

    // Both should give non-zero wake losses
    expect(jensen.wakeLossPercent).toBeGreaterThan(0);
    expect(bastankhah.wakeLossPercent).toBeGreaterThan(0);

    // They should be in the same order of magnitude (within factor of 3)
    const ratio = jensen.wakeLossPercent / bastankhah.wakeLossPercent;
    expect(ratio).toBeGreaterThan(0.33);
    expect(ratio).toBeLessThan(3);
  });
});
