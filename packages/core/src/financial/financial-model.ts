import type { EnergyYieldResult } from '../types/energy.js';
import type {
  FinancialParams,
  LcoeResult,
  IrrResult,
  PaybackResult,
  YearlyCashflow,
  CashflowProjection,
} from '../types/financial.js';

/** Default financial parameters for UK onshore wind */
export const DEFAULT_FINANCIAL_PARAMS: FinancialParams = {
  capexPerMw: 1_300_000,
  opexPerMwPerYear: 45_000,
  energyPricePerMwh: 60,
  discountRate: 0.08,
  projectLifeYears: 25,
  degradationRatePercent: 0.016,
  constructionYears: 2,
  inflationRate: 0.02,
  decommissioningFraction: 0.03,
  currency: 'GBP',
};

/**
 * Merge user-provided partial params with defaults.
 */
export function resolveParams(partial?: Partial<FinancialParams>): FinancialParams {
  return { ...DEFAULT_FINANCIAL_PARAMS, ...partial };
}

/**
 * Calculate Levelised Cost of Energy (LCOE).
 *
 * LCOE = sum(discounted costs) / sum(discounted energy)
 */
export function calculateLcoe(
  aep: EnergyYieldResult,
  params?: Partial<FinancialParams>,
): LcoeResult {
  const p = resolveParams(params);
  const capacityMw = (aep.turbineCount * aep.turbineModel.ratedPowerKw) / 1000;
  const totalCapex = capacityMw * p.capexPerMw + (p.gridConnectionCostGbp ?? 0);
  const annualOpex = capacityMw * p.opexPerMwPerYear;
  const decommissioningCost = totalCapex * p.decommissioningFraction;

  let totalDiscountedCost = 0;
  let totalDiscountedEnergy = 0;

  // Construction phase: spread CAPEX evenly across construction years
  for (let y = 0; y < p.constructionYears; y++) {
    const discountFactor = 1 / (1 + p.discountRate) ** y;
    totalDiscountedCost += (totalCapex / p.constructionYears) * discountFactor;
  }

  // Operational phase
  for (let y = 1; y <= p.projectLifeYears; y++) {
    const yearFromStart = p.constructionYears + y - 1;
    const discountFactor = 1 / (1 + p.discountRate) ** yearFromStart;
    const degradation = (1 - p.degradationRatePercent) ** (y - 1);
    const inflatedOpex = annualOpex * (1 + p.inflationRate) ** (y - 1);

    totalDiscountedCost += inflatedOpex * discountFactor;

    const yearEnergy = aep.netTotalAepMwh * degradation;
    totalDiscountedEnergy += yearEnergy * discountFactor;
  }

  // Decommissioning at end of life
  const decommYear = p.constructionYears + p.projectLifeYears;
  const decommDiscount = 1 / (1 + p.discountRate) ** decommYear;
  totalDiscountedCost += decommissioningCost * decommDiscount;

  const lcoe = totalDiscountedEnergy > 0 ? totalDiscountedCost / totalDiscountedEnergy : 0;

  return {
    lcoePerMwh: Math.round(lcoe * 100) / 100,
    totalLifetimeCostGbp: Math.round(totalDiscountedCost),
    totalLifetimeEnergyMwh: Math.round(totalDiscountedEnergy),
    breakdown: {
      capex: Math.round(totalCapex),
      opex: Math.round(annualOpex * p.projectLifeYears),
      decommissioning: Math.round(decommissioningCost),
    },
    summary:
      `LCOE: ${p.currency} ${lcoe.toFixed(2)}/MWh. ` +
      `Total lifetime cost: ${p.currency} ${formatNumber(totalDiscountedCost)}. ` +
      `Lifetime discounted energy: ${formatNumber(totalDiscountedEnergy)} MWh.`,
  };
}

/**
 * Calculate Internal Rate of Return (IRR) using Newton-Raphson.
 *
 * IRR is the discount rate at which NPV = 0.
 */
export function calculateIrr(aep: EnergyYieldResult, params?: Partial<FinancialParams>): IrrResult {
  const p = resolveParams(params);
  const cashflows = buildCashflowArray(aep, p);

  const irr = solveIrr(cashflows);
  const converged = Number.isFinite(irr);

  return {
    irr: converged ? Math.round(irr * 10000) / 10000 : 0,
    converged,
    summary: converged
      ? `IRR: ${(irr * 100).toFixed(2)}%. ` +
        (irr > p.discountRate
          ? 'Project returns exceed the discount rate.'
          : 'Project returns are below the discount rate.')
      : 'IRR could not converge. Project may not be financially viable.',
  };
}

/**
 * Calculate simple and discounted payback periods.
 */
export function calculatePayback(
  aep: EnergyYieldResult,
  params?: Partial<FinancialParams>,
): PaybackResult {
  const p = resolveParams(params);
  const capacityMw = (aep.turbineCount * aep.turbineModel.ratedPowerKw) / 1000;
  const totalCapex = capacityMw * p.capexPerMw + (p.gridConnectionCostGbp ?? 0);
  const annualOpex = capacityMw * p.opexPerMwPerYear;
  const totalYears = p.constructionYears + p.projectLifeYears;

  let cumulativeCash = 0;
  let cumulativeDiscounted = 0;
  let simplePayback = Infinity;
  let discountedPayback = Infinity;

  for (let y = 0; y < totalYears; y++) {
    let netCash: number;
    if (y < p.constructionYears) {
      netCash = -(totalCapex / p.constructionYears);
    } else {
      const opYear = y - p.constructionYears + 1;
      const degradation = (1 - p.degradationRatePercent) ** (opYear - 1);
      const energy = aep.netTotalAepMwh * degradation;
      const revenue = energy * p.energyPricePerMwh * (1 + p.inflationRate) ** (opYear - 1);
      const opex = annualOpex * (1 + p.inflationRate) ** (opYear - 1);
      netCash = revenue - opex;
    }

    const discountFactor = 1 / (1 + p.discountRate) ** y;
    cumulativeCash += netCash;
    cumulativeDiscounted += netCash * discountFactor;

    if (cumulativeCash >= 0 && simplePayback === Infinity) {
      // Interpolate within this year
      const prevCash = cumulativeCash - netCash;
      simplePayback = y + (prevCash < 0 ? -prevCash / netCash : 0);
    }
    if (cumulativeDiscounted >= 0 && discountedPayback === Infinity) {
      const prevDisc = cumulativeDiscounted - netCash * discountFactor;
      discountedPayback = y + (prevDisc < 0 ? -prevDisc / (netCash * discountFactor) : 0);
    }
  }

  const simpleRounded = Number.isFinite(simplePayback)
    ? Math.round(simplePayback * 10) / 10
    : Infinity;
  const discountedRounded = Number.isFinite(discountedPayback)
    ? Math.round(discountedPayback * 10) / 10
    : Infinity;

  return {
    simplePaybackYears: simpleRounded,
    discountedPaybackYears: discountedRounded,
    summary:
      `Simple payback: ${Number.isFinite(simpleRounded) ? `${simpleRounded} years` : 'not achieved'}. ` +
      `Discounted payback: ${Number.isFinite(discountedRounded) ? `${discountedRounded} years` : 'not achieved'}.`,
  };
}

/**
 * Generate a full cashflow projection over the project lifetime.
 */
export function generateCashflow(
  aep: EnergyYieldResult,
  params?: Partial<FinancialParams>,
): CashflowProjection {
  const p = resolveParams(params);
  const capacityMw = (aep.turbineCount * aep.turbineModel.ratedPowerKw) / 1000;
  const totalCapex = capacityMw * p.capexPerMw + (p.gridConnectionCostGbp ?? 0);
  const annualOpex = capacityMw * p.opexPerMwPerYear;
  const decommCost = totalCapex * p.decommissioningFraction;
  const totalYears = p.constructionYears + p.projectLifeYears + 1; // +1 for decommissioning

  const years: YearlyCashflow[] = [];
  let cumulativeCash = 0;
  let cumulativeDiscounted = 0;

  for (let y = 0; y < totalYears; y++) {
    let revenue = 0;
    let opex = 0;
    let capex = 0;
    let energy = 0;

    if (y < p.constructionYears) {
      // Construction phase
      capex = totalCapex / p.constructionYears;
    } else if (y < p.constructionYears + p.projectLifeYears) {
      // Operational phase
      const opYear = y - p.constructionYears + 1;
      const degradation = (1 - p.degradationRatePercent) ** (opYear - 1);
      energy = aep.netTotalAepMwh * degradation;
      revenue = energy * p.energyPricePerMwh * (1 + p.inflationRate) ** (opYear - 1);
      opex = annualOpex * (1 + p.inflationRate) ** (opYear - 1);
    } else {
      // Decommissioning year
      opex = decommCost;
    }

    const netCash = revenue - opex - capex;
    cumulativeCash += netCash;

    const discountFactor = 1 / (1 + p.discountRate) ** y;
    const discountedCash = netCash * discountFactor;
    cumulativeDiscounted += discountedCash;

    years.push({
      year: y,
      revenueGbp: Math.round(revenue),
      opexGbp: Math.round(opex),
      capexGbp: Math.round(capex),
      netCashflowGbp: Math.round(netCash),
      cumulativeCashflowGbp: Math.round(cumulativeCash),
      discountedCashflowGbp: Math.round(discountedCash),
      cumulativeDiscountedCashflowGbp: Math.round(cumulativeDiscounted),
      energyMwh: Math.round(energy),
    });
  }

  // Find payback years
  const payback = calculatePayback(aep, params);
  const irr = calculateIrr(aep, params);

  return {
    years,
    npvGbp: Math.round(cumulativeDiscounted),
    irr: irr.irr,
    simplePaybackYears: payback.simplePaybackYears,
    discountedPaybackYears: payback.discountedPaybackYears,
    installedCapacityMw: Math.round(capacityMw * 100) / 100,
    totalCapexGbp: Math.round(totalCapex),
    summary:
      `${capacityMw.toFixed(1)} MW project. ` +
      `NPV: ${p.currency} ${formatNumber(cumulativeDiscounted)}. ` +
      `IRR: ${irr.converged ? `${(irr.irr * 100).toFixed(1)}%` : 'N/A'}. ` +
      `Payback: ${Number.isFinite(payback.simplePaybackYears) ? `${payback.simplePaybackYears} years` : 'not achieved'}.`,
  };
}

// ─── Internal helpers ───

function buildCashflowArray(aep: EnergyYieldResult, p: FinancialParams): number[] {
  const capacityMw = (aep.turbineCount * aep.turbineModel.ratedPowerKw) / 1000;
  const totalCapex = capacityMw * p.capexPerMw + (p.gridConnectionCostGbp ?? 0);
  const annualOpex = capacityMw * p.opexPerMwPerYear;
  const decommCost = totalCapex * p.decommissioningFraction;

  const cashflows: number[] = [];

  // Construction
  for (let y = 0; y < p.constructionYears; y++) {
    cashflows.push(-(totalCapex / p.constructionYears));
  }

  // Operations
  for (let y = 1; y <= p.projectLifeYears; y++) {
    const degradation = (1 - p.degradationRatePercent) ** (y - 1);
    const energy = aep.netTotalAepMwh * degradation;
    const revenue = energy * p.energyPricePerMwh * (1 + p.inflationRate) ** (y - 1);
    const opex = annualOpex * (1 + p.inflationRate) ** (y - 1);
    cashflows.push(revenue - opex);
  }

  // Decommissioning
  cashflows.push(-decommCost);

  return cashflows;
}

/**
 * Solve IRR using Newton-Raphson method.
 * IRR is the rate r where NPV(r) = sum(CF_t / (1+r)^t) = 0.
 */
function solveIrr(
  cashflows: number[],
  maxIterations: number = 100,
  tolerance: number = 1e-7,
): number {
  let r = 0.1; // initial guess

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dnpv = 0; // derivative

    for (let t = 0; t < cashflows.length; t++) {
      const cf = cashflows[t]!;
      const factor = (1 + r) ** t;
      npv += cf / factor;
      dnpv -= (t * cf) / (1 + r) ** (t + 1);
    }

    if (Math.abs(npv) < tolerance) {
      return r;
    }

    if (Math.abs(dnpv) < 1e-15) {
      break; // avoid division by zero
    }

    const newR = r - npv / dnpv;

    // Clamp to reasonable range
    if (newR < -0.5) r = -0.5;
    else if (newR > 5) r = 5;
    else r = newR;
  }

  // If Newton-Raphson didn't converge, try bisection as fallback
  return bisectionIrr(cashflows);
}

function bisectionIrr(cashflows: number[], tolerance: number = 1e-6): number {
  let lo = -0.5;
  let hi = 5.0;

  const npvAt = (r: number): number => {
    let sum = 0;
    for (let t = 0; t < cashflows.length; t++) {
      sum += cashflows[t]! / (1 + r) ** t;
    }
    return sum;
  };

  const npvLo = npvAt(lo);
  const npvHi = npvAt(hi);

  // No sign change means no root in this range
  if (npvLo * npvHi > 0) return NaN;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npvAt(mid);

    if (Math.abs(npvMid) < tolerance || (hi - lo) / 2 < tolerance) {
      return mid;
    }

    if (npvMid * npvLo < 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return NaN;
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-GB');
}
