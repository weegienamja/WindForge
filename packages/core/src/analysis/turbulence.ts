import type { HourlyWindData, DailyWindData } from '../types/datasources.js';
import type {
  TurbulenceResult,
  TurbulenceBin,
  TurbulenceReferenceCategory,
} from '../types/wind-assessment.js';

/**
 * Calculate an hourly variability proxy. It is not turbulence intensity as
 * defined for an IEC assessment because the provider values are hourly means.
 *
 * For hourly data: TI = sigma_v / V_mean for each speed bin,
 * using consecutive-hour differences as a proxy for sub-hourly variability.
 *
 * Daily mean data are rejected because they do not retain the temporal
 * variability needed even for this proxy.
 *
 * @param data - Hourly or daily wind data
 * @param heightKey - Which height to analyse: 'ws10m' or 'ws50m' (default: 'ws50m')
 * @param binWidthMs - Width of each speed bin in m/s (default: 1)
 * @returns Hourly variability proxy with an explicit screening limitation
 */
export function estimateTurbulenceIntensity(
  data: HourlyWindData | DailyWindData,
  heightKey: 'ws10m' | 'ws50m' = 'ws50m',
  binWidthMs: number = 1,
): TurbulenceResult {
  const isHourly = 'datetime' in (data.records[0] ?? {});

  if (isHourly) {
    return estimateFromHourly(data as HourlyWindData, heightKey, binWidthMs);
  }
  return unsupportedDailyResult();
}

function estimateFromHourly(
  data: HourlyWindData,
  heightKey: 'ws10m' | 'ws50m',
  binWidthMs: number,
): TurbulenceResult {
  const speeds = data.records
    .map((r) => r[heightKey])
    .filter((speed): speed is number => speed !== null && speed > 0);

  if (speeds.length < 10) {
    return emptyResult('hourly');
  }

  // Compute the spread of hourly means within each speed bin. This is a
  // variability indicator only; it does not reconstruct ten-minute TI.
  const speedBinMap = new Map<number, number[]>();
  for (const speed of speeds) {
    const binCentre = Math.round(speed / binWidthMs) * binWidthMs;
    if (!speedBinMap.has(binCentre)) {
      speedBinMap.set(binCentre, []);
    }
    speedBinMap.get(binCentre)!.push(speed);
  }

  const tiBins: TurbulenceBin[] = [];
  for (const [binCentre, binSpeeds] of speedBinMap.entries()) {
    if (binCentre < 1 || binSpeeds.length < 3) continue;

    const mean = binSpeeds.reduce((s, v) => s + v, 0) / binSpeeds.length;
    const variance = binSpeeds.reduce((s, v) => s + (v - mean) ** 2, 0) / binSpeeds.length;
    const sigma = Math.sqrt(variance);
    const ti = mean > 0 ? sigma / mean : 0;

    tiBins.push({
      speedBinMs: binCentre,
      ti: Math.round(ti * 1000) / 1000,
      count: binSpeeds.length,
    });
  }

  tiBins.sort((a, b) => a.speedBinMs - b.speedBinMs);

  return buildResult(tiBins, 'hourly');
}

function buildResult(tiBins: TurbulenceBin[], dataSource: 'hourly'): TurbulenceResult {
  if (tiBins.length === 0) {
    return emptyResult(dataSource);
  }

  // Weighted mean TI
  let totalWeight = 0;
  let weightedTi = 0;
  for (const bin of tiBins) {
    weightedTi += bin.ti * bin.count;
    totalWeight += bin.count;
  }
  const meanTi = totalWeight > 0 ? weightedTi / totalWeight : 0;

  // Representative TI at 15 m/s (interpolate)
  const representativeTi = interpolateTi(tiBins, 15);

  return {
    meanTi: Math.round(meanTi * 1000) / 1000,
    tiBins,
    referenceCategory: null,
    representativeTi: Math.round(representativeTi * 1000) / 1000,
    dataSource,
    assessmentLevel: 'variability_proxy',
    limitation:
      'Hourly mean values do not resolve the ten-minute and sub-ten-minute variability required for IEC turbulence assessment.',
    summary:
      `Hourly variability proxy: ${(meanTi * 100).toFixed(1)}%; ` +
      `proxy at 15 m/s: ${(representativeTi * 100).toFixed(1)}%. ` +
      'No IEC turbulence category is assigned.',
  };
}

function emptyResult(dataSource: 'hourly'): TurbulenceResult {
  return {
    meanTi: null,
    tiBins: [],
    referenceCategory: null,
    representativeTi: null,
    dataSource,
    assessmentLevel: 'unsupported',
    limitation: 'Insufficient hourly records for a variability proxy.',
    summary: 'Insufficient hourly data for a variability proxy; no turbulence result was produced.',
  };
}

function unsupportedDailyResult(): TurbulenceResult {
  return {
    meanTi: null,
    tiBins: [],
    referenceCategory: null,
    representativeTi: null,
    dataSource: 'daily_unsupported',
    assessmentLevel: 'unsupported',
    limitation: 'Daily mean wind speeds cannot resolve turbulence intensity.',
    summary: 'Daily mean data are unsuitable for turbulence assessment; no result was produced.',
  };
}

/**
 * Classify turbulence intensity according to IEC 61400-1 Ed. 3.
 * Reference TI at 15 m/s:
 * - Class A: I_ref = 0.16
 * - Class B: I_ref = 0.14
 * - Class C: I_ref = 0.12
 */
export function classifyTurbulence(representativeTi: number): TurbulenceReferenceCategory {
  if (representativeTi > 0.16) return 'exceeds_A';
  if (representativeTi > 0.14) return 'A';
  if (representativeTi > 0.12) return 'B';
  return 'C';
}

function interpolateTi(bins: TurbulenceBin[], targetSpeed: number): number {
  if (bins.length === 0) return 0;

  // Find the two nearest bins
  let lower: TurbulenceBin | undefined;
  let upper: TurbulenceBin | undefined;

  for (const bin of bins) {
    if (bin.speedBinMs <= targetSpeed) {
      if (!lower || bin.speedBinMs > lower.speedBinMs) lower = bin;
    }
    if (bin.speedBinMs >= targetSpeed) {
      if (!upper || bin.speedBinMs < upper.speedBinMs) upper = bin;
    }
  }

  if (!lower && !upper) return 0;
  if (!lower) return upper!.ti;
  if (!upper) return lower.ti;
  if (lower.speedBinMs === upper.speedBinMs) return lower.ti;

  // Linear interpolation
  const frac = (targetSpeed - lower.speedBinMs) / (upper.speedBinMs - lower.speedBinMs);
  return lower.ti + frac * (upper.ti - lower.ti);
}
