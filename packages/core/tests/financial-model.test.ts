import { describe, it, expect } from 'vitest';
import {
  calculateLcoe,
  calculateIrr,
  calculatePayback,
  generateCashflow,
  resolveParams,
  DEFAULT_FINANCIAL_PARAMS,
  runSensitivityAnalysis,
  compareScenarios,
  DEFAULT_VARIATIONS,
} from '../src/index.js';
import type { EnergyYieldResult, FinancialParams } from '../src/types/index.js';

// ─── Helpers ───

function makeAep(overrides?: Partial<EnergyYieldResult>): EnergyYieldResult {
  return {
    turbineModel: {
      id: 'test',
      manufacturer: 'Test',
      model: 'T100',
      ratedPowerKw: 3000,
      rotorDiameterM: 100,
    },
    hubHeightM: 80,
    turbineCount: 5,
    grossAepMwh: 13000,
    grossTotalAepMwh: 65000,
    grossCapacityFactor: 0.35,
    losses: {
      wakeLossPct: 5,
      electricalLossPct: 2,
      availabilityLossPct: 3,
      environmentalLossPct: 1,
      icingLossPct: 0,
      hysteresisLossPct: 0.5,
      gridCurtailmentPct: 1,
      totalLossPct: 12.5,
      items: [],
    },
    netAepMwh: 11375,
    netTotalAepMwh: 56875,
    netCapacityFactor: 0.306,
    centralEstimate: {
      label: 'Central estimate',
      aepMwh: 11375,
      totalAepMwh: 56875,
      capacityFactor: 0.306,
      description: '',
    },
    downside10: {
      label: '10% downside',
      aepMwh: 10238,
      totalAepMwh: 51188,
      capacityFactor: 0.275,
      description: '',
    },
    downside20: {
      label: '20% downside',
      aepMwh: 9100,
      totalAepMwh: 45500,
      capacityFactor: 0.245,
      description: '',
    },
    monthlyProductionMwh: Array(12).fill(4740),
    assumptions: {
      windDataYears: 10,
      referenceHeightM: 50,
      extrapolationMethod: 'power_law',
      airDensityKgM3: 1.225,
      weibullK: 2.0,
      weibullC: 8.0,
      lossAssumptions: 'standard',
      uncertaintyMethod: 'gaussian',
    },
    confidence: 'medium',
    summary: 'Test AEP',
    ...overrides,
  };
}

// ─── resolveParams ───

describe('resolveParams', () => {
  it('returns defaults when no overrides', () => {
    const p = resolveParams();
    expect(p.capexPerMw).toBe(1_300_000);
    expect(p.discountRate).toBe(0.08);
    expect(p.projectLifeYears).toBe(25);
  });

  it('merges overrides with defaults', () => {
    const p = resolveParams({ energyPricePerMwh: 80 });
    expect(p.energyPricePerMwh).toBe(80);
    expect(p.capexPerMw).toBe(1_300_000);
  });
});

// ─── calculateLcoe ───

describe('calculateLcoe', () => {
  it('computes a positive LCOE for standard parameters', () => {
    const aep = makeAep();
    const result = calculateLcoe(aep);

    expect(result.lcoePerMwh).toBeGreaterThan(0);
    expect(result.lcoePerMwh).toBeLessThan(200); // sanity upper bound
    expect(result.totalLifetimeCostGbp).toBeGreaterThan(0);
    expect(result.totalLifetimeEnergyMwh).toBeGreaterThan(0);
    expect(result.breakdown.capex).toBeGreaterThan(0);
    expect(result.breakdown.opex).toBeGreaterThan(0);
    expect(result.summary).toContain('LCOE');
  });

  it('LCOE increases with higher CAPEX', () => {
    const aep = makeAep();
    const baseLcoe = calculateLcoe(aep).lcoePerMwh;
    const highCapex = calculateLcoe(aep, { capexPerMw: 2_000_000 }).lcoePerMwh;

    expect(highCapex).toBeGreaterThan(baseLcoe);
  });

  it('LCOE decreases with higher energy production', () => {
    const lowAep = makeAep({ netTotalAepMwh: 30000 });
    const highAep = makeAep({ netTotalAepMwh: 80000 });

    const lowLcoe = calculateLcoe(lowAep).lcoePerMwh;
    const highLcoe = calculateLcoe(highAep).lcoePerMwh;

    expect(lowLcoe).toBeGreaterThan(highLcoe);
  });

  it('handles zero AEP gracefully', () => {
    const zeroAep = makeAep({ netTotalAepMwh: 0 });
    const result = calculateLcoe(zeroAep);
    expect(result.lcoePerMwh).toBe(0);
  });

  it('includes grid connection cost if provided', () => {
    const aep = makeAep();
    const withoutGrid = calculateLcoe(aep).lcoePerMwh;
    const withGrid = calculateLcoe(aep, { gridConnectionCostGbp: 1_000_000 }).lcoePerMwh;

    expect(withGrid).toBeGreaterThan(withoutGrid);
  });

  it('accounts for degradation over project life', () => {
    const aep = makeAep();
    const noDeg = calculateLcoe(aep, { degradationRatePercent: 0 });
    const highDeg = calculateLcoe(aep, { degradationRatePercent: 0.05 });

    // Higher degradation means less energy over lifetime so higher LCOE
    expect(highDeg.lcoePerMwh).toBeGreaterThan(noDeg.lcoePerMwh);
  });
});

// ─── calculateIrr ───

describe('calculateIrr', () => {
  it('computes a positive IRR for a viable project', () => {
    const aep = makeAep();
    const result = calculateIrr(aep);

    expect(result.converged).toBe(true);
    expect(result.irr).toBeGreaterThan(0);
    expect(result.irr).toBeLessThan(1); // reasonable upper bound
    expect(result.summary).toContain('IRR');
  });

  it('IRR decreases with higher CAPEX', () => {
    const aep = makeAep();
    const baseIrr = calculateIrr(aep).irr;
    const highCapexIrr = calculateIrr(aep, { capexPerMw: 3_000_000 }).irr;

    expect(highCapexIrr).toBeLessThan(baseIrr);
  });

  it('handles unviable project', () => {
    // Very low AEP, very high CAPEX
    const aep = makeAep({ netTotalAepMwh: 100 });
    const result = calculateIrr(aep, { capexPerMw: 5_000_000 });

    // May not converge or produce negative IRR
    if (result.converged) {
      expect(result.irr).toBeLessThan(0);
    }
  });
});

// ─── calculatePayback ───

describe('calculatePayback', () => {
  it('computes payback for a viable project', () => {
    const aep = makeAep();
    const result = calculatePayback(aep);

    expect(result.simplePaybackYears).toBeGreaterThan(0);
    expect(result.simplePaybackYears).toBeLessThan(30);
    expect(result.discountedPaybackYears).toBeGreaterThanOrEqual(result.simplePaybackYears);
    expect(result.summary).toContain('payback');
  });

  it('discounted payback is longer than simple payback', () => {
    const aep = makeAep();
    const result = calculatePayback(aep);

    if (Number.isFinite(result.discountedPaybackYears)) {
      expect(result.discountedPaybackYears).toBeGreaterThanOrEqual(result.simplePaybackYears);
    }
  });

  it('payback increases with higher CAPEX', () => {
    const aep = makeAep();
    const base = calculatePayback(aep).simplePaybackYears;
    const high = calculatePayback(aep, { capexPerMw: 2_500_000 }).simplePaybackYears;

    expect(high).toBeGreaterThan(base);
  });
});

// ─── generateCashflow ───

describe('generateCashflow', () => {
  it('generates correct number of years', () => {
    const aep = makeAep();
    const result = generateCashflow(aep);

    // constructionYears(2) + projectLife(25) + decommissioning(1) = 28
    expect(result.years.length).toBe(28);
  });

  it('construction years have capex and no revenue', () => {
    const aep = makeAep();
    const result = generateCashflow(aep);

    const constructionYears = result.years.slice(0, 2);
    for (const y of constructionYears) {
      expect(y.capexGbp).toBeGreaterThan(0);
      expect(y.revenueGbp).toBe(0);
      expect(y.netCashflowGbp).toBeLessThan(0);
    }
  });

  it('operational years have revenue and opex', () => {
    const aep = makeAep();
    const result = generateCashflow(aep);

    const firstOpYear = result.years[2]!;
    expect(firstOpYear.revenueGbp).toBeGreaterThan(0);
    expect(firstOpYear.opexGbp).toBeGreaterThan(0);
    expect(firstOpYear.energyMwh).toBeGreaterThan(0);
  });

  it('energy degrades over operational years', () => {
    const aep = makeAep();
    const result = generateCashflow(aep, { degradationRatePercent: 0.02 });

    const firstOp = result.years[2]!;
    const lastOp = result.years[26]!;
    expect(lastOp.energyMwh).toBeLessThan(firstOp.energyMwh);
  });

  it('NPV matches cumulative discounted cashflow', () => {
    const aep = makeAep();
    const result = generateCashflow(aep);

    const lastYear = result.years[result.years.length - 1]!;
    expect(result.npvGbp).toBe(lastYear.cumulativeDiscountedCashflowGbp);
  });

  it('includes capacity and CAPEX totals', () => {
    const aep = makeAep();
    const result = generateCashflow(aep);

    expect(result.installedCapacityMw).toBe(15); // 5 * 3MW
    expect(result.totalCapexGbp).toBe(15 * 1_300_000);
    expect(result.summary).toContain('MW');
  });
});

// ─── Sensitivity Analysis ───

describe('runSensitivityAnalysis', () => {
  it('returns sorted results with spread', () => {
    const aep = makeAep();
    const result = runSensitivityAnalysis(aep);

    expect(result.baseLcoe).toBeGreaterThan(0);
    expect(result.items.length).toBe(DEFAULT_VARIATIONS.length);

    // Should be sorted by spread descending
    for (let i = 1; i < result.items.length; i++) {
      expect(result.items[i]!.spread).toBeLessThanOrEqual(result.items[i - 1]!.spread);
    }
  });

  it('each item shows LCOE variation around base', () => {
    const aep = makeAep();
    const result = runSensitivityAnalysis(aep);

    for (const item of result.items) {
      expect(item.lcoeBase).toBe(result.baseLcoe);
      expect(item.spread).toBeGreaterThanOrEqual(0);
    }
  });

  it('accepts custom variations', () => {
    const aep = makeAep();
    const result = runSensitivityAnalysis(aep, undefined, [
      { parameter: 'energyPricePerMwh', label: 'Price', low: 30, high: 100 },
    ]);

    expect(result.items.length).toBe(1);
    expect(result.items[0]!.label).toBe('Price');
  });

  it('summary mentions most sensitive parameter', () => {
    const aep = makeAep();
    const result = runSensitivityAnalysis(aep);

    expect(result.summary).toContain('Most sensitive');
    expect(result.summary).toContain('Base LCOE');
  });
});

// ─── Scenario Comparison ───

describe('compareScenarios', () => {
  it('compares multiple scenarios', () => {
    const aep = makeAep();
    const results = compareScenarios(aep, [
      { label: 'Base', params: {} },
      { label: 'High Price', params: { energyPricePerMwh: 100 } },
      { label: 'Low Price', params: { energyPricePerMwh: 30 } },
    ]);

    expect(results.length).toBe(3);
    expect(results[0]!.label).toBe('Base');

    // Higher price should yield better NPV
    const highPrice = results.find((r) => r.label === 'High Price')!;
    const lowPrice = results.find((r) => r.label === 'Low Price')!;
    expect(highPrice.npvGbp).toBeGreaterThan(lowPrice.npvGbp);
  });

  it('each scenario has valid LCOE', () => {
    const aep = makeAep();
    const results = compareScenarios(aep, [
      { label: 'A', params: { discountRate: 0.05 } },
      { label: 'B', params: { discountRate: 0.12 } },
    ]);

    for (const r of results) {
      expect(r.lcoePerMwh).toBeGreaterThan(0);
    }
  });
});
