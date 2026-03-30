import type { TurbineModel, PowerCurvePoint } from '../types/turbines.js';
import type {
  EnergyYieldResult,
  LossStack,
  LossItem,
  PScenario,
  AepAssumptions,
  AepOptions,
  LossOverrides,
} from '../types/energy.js';
import type { WindDataSummary } from '../types/datasources.js';
import type { ScoringError } from '../types/errors.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { extrapolateWindSpeed } from '../utils/wind-shear.js';

const HOURS_PER_YEAR = 8760;

// Default loss percentages (industry-standard conservative assumptions)
const DEFAULT_LOSSES: LossOverrides = {
  wakeLossPct: 8,
  electricalLossPct: 2,
  availabilityLossPct: 3,
  environmentalLossPct: 1,
  icingLossPct: 0.5,
  hysteresisLossPct: 0.5,
  gridCurtailmentPct: 1,
};

/**
 * Calculate Annual Energy Production for a single turbine model at a site.
 *
 * Method:
 * 1. Extrapolate wind speed to hub height using power law
 * 2. Fit Weibull distribution to wind regime
 * 3. Integrate power curve against Weibull PDF to get gross AEP
 * 4. Apply air density correction
 * 5. Apply loss stack to get net AEP
 * 6. Compute P50/P75/P90 scenarios using interannual variability
 * 7. Compute monthly production breakdown
 */
export function calculateAep(
  windData: WindDataSummary,
  turbine: TurbineModel,
  options: AepOptions = {},
): Result<EnergyYieldResult, ScoringError> {
  const hubHeightM = options.hubHeightM ?? turbine.hubHeightOptionsM[0] ?? 80;
  const turbineCount = options.turbineCount ?? 1;
  const elevationM = options.elevationM ?? 0;
  const roughnessAlpha = options.windShearAlpha ?? 0.14;

  if (windData.annualAverageSpeedMs <= 0) {
    return err(scoringError(ScoringErrorCode.DataFetchFailed, 'No valid wind speed data available'));
  }

  if (turbine.powerCurve.length < 3) {
    return err(scoringError(ScoringErrorCode.Unknown, 'Turbine power curve has insufficient data points'));
  }

  // 1. Extrapolate wind speed to hub height
  const refHeightM = windData.referenceHeightM ?? 50;
  const hubSpeedMs = extrapolateWindSpeed(
    windData.annualAverageSpeedMs,
    refHeightM,
    hubHeightM,
    roughnessAlpha,
  );

  // 2. Fit Weibull parameters from mean and standard deviation
  const { k, c } = fitWeibullFromStats(hubSpeedMs, windData.speedStdDevMs ?? hubSpeedMs * 0.5);

  // 3. Gross AEP from Weibull x power curve integration
  const grossAepPerTurbineMwh = integrateWeibullPowerCurve(k, c, turbine.powerCurve) / 1000;

  // 4. Air density correction
  const airDensityKgM3 = computeAirDensity(elevationM);
  const densityFactor = airDensityKgM3 / 1.225;
  const densityCorrectedAepMwh = grossAepPerTurbineMwh * densityFactor;

  // 5. Build loss stack
  const lossOverrides = { ...DEFAULT_LOSSES, ...options.losses };
  const losses = buildLossStack(lossOverrides, turbineCount);

  // 6. Net AEP
  const netMultiplier = 1 - losses.totalLossPct / 100;
  const netAepPerTurbineMwh = densityCorrectedAepMwh * netMultiplier;
  const netTotalAepMwh = netAepPerTurbineMwh * turbineCount;
  const grossTotalAepMwh = densityCorrectedAepMwh * turbineCount;

  // Capacity factor
  const ratedCapacityMwh = (turbine.ratedPowerKw / 1000) * HOURS_PER_YEAR;
  const grossCapacityFactor = densityCorrectedAepMwh / ratedCapacityMwh;
  const netCapacityFactor = netAepPerTurbineMwh / ratedCapacityMwh;

  // 7. P-scenarios using interannual wind variability
  const interannualStdDev = windData.speedStdDevMs ?? hubSpeedMs * 0.06;
  const windCov = interannualStdDev / hubSpeedMs;
  // Energy COV is approximately 2x wind speed COV (cubic relationship)
  const energyCov = Math.min(windCov * 2, 0.3);

  const p50 = buildPScenario('P50', netAepPerTurbineMwh, turbineCount, ratedCapacityMwh, 0, energyCov);
  const p75 = buildPScenario('P75', netAepPerTurbineMwh, turbineCount, ratedCapacityMwh, 0.674, energyCov);
  const p90 = buildPScenario('P90', netAepPerTurbineMwh, turbineCount, ratedCapacityMwh, 1.282, energyCov);

  // 8. Monthly production breakdown (using monthly wind speed variation)
  const monthlyProductionMwh = computeMonthlyProduction(
    windData,
    turbine,
    hubHeightM,
    roughnessAlpha,
    netMultiplier,
    densityFactor,
  );

  // Confidence assessment
  const dataYears = windData.dataYears ?? 0;
  const confidence: 'high' | 'medium' | 'low' =
    dataYears >= 10 ? 'high' : dataYears >= 5 ? 'medium' : 'low';

  const summary = [
    `${turbine.manufacturer} ${turbine.model} at ${hubHeightM}m hub height.`,
    `Hub-height mean wind speed: ${hubSpeedMs.toFixed(1)} m/s (Weibull k=${k.toFixed(2)}, c=${c.toFixed(1)}).`,
    `Gross AEP: ${densityCorrectedAepMwh.toFixed(0)} MWh/turbine (CF ${(grossCapacityFactor * 100).toFixed(1)}%).`,
    `Net AEP (P50): ${netAepPerTurbineMwh.toFixed(0)} MWh/turbine after ${losses.totalLossPct.toFixed(1)}% losses.`,
    turbineCount > 1 ? `Total for ${turbineCount} turbines: ${netTotalAepMwh.toFixed(0)} MWh/year.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const assumptions: AepAssumptions = {
    windDataYears: dataYears,
    referenceHeightM: refHeightM,
    extrapolationMethod: 'Power law wind profile',
    airDensityKgM3,
    weibullK: k,
    weibullC: c,
    lossAssumptions: 'Industry-standard conservative assumptions',
    uncertaintyMethod: 'Interannual wind speed variability (COV-based)',
  };

  return ok({
    turbineModel: {
      id: turbine.id,
      manufacturer: turbine.manufacturer,
      model: turbine.model,
      ratedPowerKw: turbine.ratedPowerKw,
      rotorDiameterM: turbine.rotorDiameterM,
    },
    hubHeightM,
    turbineCount,
    grossAepMwh: round2(densityCorrectedAepMwh),
    grossTotalAepMwh: round2(grossTotalAepMwh),
    grossCapacityFactor: round4(grossCapacityFactor),
    losses,
    netAepMwh: round2(netAepPerTurbineMwh),
    netTotalAepMwh: round2(netTotalAepMwh),
    netCapacityFactor: round4(netCapacityFactor),
    p50,
    p75,
    p90,
    monthlyProductionMwh: monthlyProductionMwh.map(round2),
    assumptions,
    confidence,
    summary,
  });
}

// --- Weibull distribution helpers ---

/**
 * Estimate Weibull k and c parameters from mean and standard deviation.
 * Uses the approximation: k = (stdDev / mean)^(-1.086)
 */
function fitWeibullFromStats(meanSpeed: number, stdDev: number): { k: number; c: number } {
  if (meanSpeed <= 0 || stdDev <= 0) {
    return { k: 2.0, c: meanSpeed > 0 ? meanSpeed * 1.128 : 1 };
  }

  const cov = stdDev / meanSpeed;
  // Justus approximation: k = (sigma/mean)^-1.086
  const k = Math.max(1.0, Math.min(10.0, cov ** -1.086));

  // c = mean / Gamma(1 + 1/k)
  const c = meanSpeed / gammaApprox(1 + 1 / k);

  return { k: round4(k), c: round4(c) };
}

/**
 * Weibull probability density function.
 */
function weibullPdf(speed: number, k: number, c: number): number {
  if (speed < 0 || c <= 0 || k <= 0) return 0;
  if (speed === 0) return 0;
  return (k / c) * (speed / c) ** (k - 1) * Math.exp(-((speed / c) ** k));
}

/**
 * Gamma function approximation using Stirling's formula.
 * Good enough for typical Weibull parameter ranges.
 */
function gammaApprox(n: number): number {
  if (n <= 0) return 1;
  // Use Lanczos approximation for better accuracy
  if (n < 0.5) {
    return Math.PI / (Math.sin(Math.PI * n) * gammaApprox(1 - n));
  }
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  const x = n - 1;
  let sum = coef[0]!;
  for (let i = 1; i < g + 2; i++) {
    sum += coef[i]! / (x + i);
  }

  const t = x + g + 0.5;
  return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * sum;
}

/**
 * Integrate turbine power curve against Weibull PDF to compute gross AEP in kWh.
 * Uses trapezoidal rule over power curve points.
 */
function integrateWeibullPowerCurve(k: number, c: number, powerCurve: PowerCurvePoint[]): number {
  if (powerCurve.length === 0) return 0;

  let totalEnergyKwh = 0;

  for (let i = 0; i < powerCurve.length - 1; i++) {
    const p0 = powerCurve[i]!;
    const p1 = powerCurve[i + 1]!;
    const dv = p1.windSpeedMs - p0.windSpeedMs;
    if (dv <= 0) continue;

    // Trapezoidal rule: average power * probability * binWidth * hoursPerYear
    const avgPower = (p0.powerKw + p1.powerKw) / 2;
    const midSpeed = (p0.windSpeedMs + p1.windSpeedMs) / 2;
    const probability = weibullPdf(midSpeed, k, c) * dv;

    totalEnergyKwh += avgPower * probability * HOURS_PER_YEAR;
  }

  return totalEnergyKwh;
}

// --- Air density ---

/**
 * Air density correction for elevation.
 * Standard atmosphere: rho = 1.225 * exp(-0.0001184 * elevationM)
 */
function computeAirDensity(elevationM: number): number {
  return 1.225 * Math.exp(-0.0001184 * elevationM);
}

// --- Loss stack ---

function buildLossStack(overrides: LossOverrides, turbineCount: number): LossStack {
  // Adjust wake loss for larger arrays
  const wakeLoss = turbineCount > 1
    ? overrides.wakeLossPct
    : Math.min(overrides.wakeLossPct, 2); // Single turbine has minimal wake

  const items: LossItem[] = [
    { name: 'Wake losses', percent: wakeLoss, description: 'Turbine-to-turbine wake interaction', isUserOverridable: true },
    { name: 'Electrical losses', percent: overrides.electricalLossPct, description: 'Cable, transformer, and grid connection losses', isUserOverridable: true },
    { name: 'Availability', percent: overrides.availabilityLossPct, description: 'Downtime for maintenance and repair', isUserOverridable: true },
    { name: 'Environmental', percent: overrides.environmentalLossPct, description: 'Bat/bird curtailment and other environmental restrictions', isUserOverridable: true },
    { name: 'Icing', percent: overrides.icingLossPct, description: 'Blade icing and cold climate shutdowns', isUserOverridable: true },
    { name: 'Hysteresis', percent: overrides.hysteresisLossPct, description: 'Start/stop hysteresis around cut-in/cut-out', isUserOverridable: true },
    { name: 'Grid curtailment', percent: overrides.gridCurtailmentPct, description: 'Grid operator dispatch curtailment', isUserOverridable: true },
  ];

  // Compound multiplicatively: total = 1 - product(1 - loss_i/100)
  let netFraction = 1;
  for (const item of items) {
    netFraction *= 1 - item.percent / 100;
  }
  const totalLossPct = round2((1 - netFraction) * 100);

  return {
    wakeLossPct: wakeLoss,
    electricalLossPct: overrides.electricalLossPct,
    availabilityLossPct: overrides.availabilityLossPct,
    environmentalLossPct: overrides.environmentalLossPct,
    icingLossPct: overrides.icingLossPct,
    hysteresisLossPct: overrides.hysteresisLossPct,
    gridCurtailmentPct: overrides.gridCurtailmentPct,
    totalLossPct,
    items,
  };
}

// --- P-scenarios ---

function buildPScenario(
  label: string,
  netAepPerTurbineMwh: number,
  turbineCount: number,
  ratedCapacityMwh: number,
  zScore: number,
  energyCov: number,
): PScenario {
  // P50 = median (zScore=0), P75 exceedance (zScore=0.674), P90 (zScore=1.282)
  const exceedanceFactor = 1 - zScore * energyCov;
  const aepMwh = round2(netAepPerTurbineMwh * exceedanceFactor);
  const totalAepMwh = round2(aepMwh * turbineCount);
  const capacityFactor = round4(aepMwh / ratedCapacityMwh);

  const descriptions: Record<string, string> = {
    P50: 'Median annual energy - 50% probability of exceedance',
    P75: 'Conservative estimate - 75% probability of exceedance',
    P90: 'Bankable estimate - 90% probability of exceedance (used for financing)',
  };

  return {
    label,
    aepMwh,
    totalAepMwh,
    capacityFactor,
    description: descriptions[label] ?? label,
  };
}

// --- Monthly breakdown ---

function computeMonthlyProduction(
  windData: WindDataSummary,
  turbine: TurbineModel,
  hubHeightM: number,
  alpha: number,
  netMultiplier: number,
  densityFactor: number,
): number[] {
  const refHeightM = windData.referenceHeightM ?? 50;
  const monthly: number[] = [];

  for (let month = 0; month < 12; month++) {
    const monthlyAvg = windData.monthlyAverages[month];
    if (!monthlyAvg) {
      monthly.push(0);
      continue;
    }

    const monthSpeedHub = extrapolateWindSpeed(monthlyAvg.averageSpeedMs, refHeightM, hubHeightM, alpha);
    const stdDev = monthSpeedHub * 0.5; // Approximate monthly std dev
    const { k, c } = fitWeibullFromStats(monthSpeedHub, stdDev);
    const grossMonthlyKwh = integrateWeibullPowerCurve(k, c, turbine.powerCurve);
    // Scale from annual integration to monthly (approximate days/365)
    const daysInMonth = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month]!;
    const monthlyKwh = grossMonthlyKwh * (daysInMonth / 365.25) * densityFactor * netMultiplier;
    monthly.push(monthlyKwh / 1000); // Convert to MWh
  }

  return monthly;
}

// --- Rounding utilities ---

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
