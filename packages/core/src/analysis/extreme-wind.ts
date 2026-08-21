import type { MonthlyWindHistory, DailyWindData } from '../types/datasources.js';
import type { ExtremeWindResult } from '../types/wind-assessment.js';

/**
 * Estimate a coarse return level using Gumbel Type I fitted to annual maxima
 * from the supplied mean-speed series.
 *
 * Extracts annual maxima from historical data and fits the Gumbel distribution
 * to estimate 50-year and 1-year return levels. These are not gust/extreme
 * wind speeds and are not suitable for assigning an IEC turbine class.
 *
 * @param history - Monthly or daily wind history data
 * @param heightKey - Which height to analyse: 'ws10m' or 'ws50m' (default: 'ws50m')
 * @returns Coarse return-level result with no IEC class inference
 */
export function estimateExtremeWind(
  history: MonthlyWindHistory | DailyWindData,
  heightKey: 'ws10m' | 'ws50m' = 'ws50m',
): ExtremeWindResult {
  const annualMaxima = extractAnnualMaxima(history, heightKey);

  if (annualMaxima.length < 5) {
    return insufficientDataResult(annualMaxima, heightKey);
  }

  const speeds = annualMaxima.map((a) => a.maxSpeedMs);

  // Fit Gumbel Type I distribution using method of moments
  const { mu, sigma } = fitGumbel(speeds);

  // Return period wind speeds
  // V_T = mu - sigma * ln(-ln(1 - 1/T))
  const v50 = gumbelQuantile(mu, sigma, 50);

  // Determine reference height
  const refHeight = heightKey === 'ws50m' ? 50 : 10;

  // Confidence assessment
  const isMonthly = 'startYear' in history;
  const confidence = assessConfidence(annualMaxima.length, isMonthly);

  const heightLabel = refHeight === 50 ? '50m' : '10m';
  const dataNote = isMonthly
    ? 'Based on monthly mean data (likely underestimates true peak speeds).'
    : 'Based on daily data.';

  return {
    annualMaxima,
    gumbelMu: Math.round(mu * 100) / 100,
    gumbelSigma: Math.round(sigma * 100) / 100,
    v50YearMs: Math.round(v50 * 100) / 100,
    v1YearMs: null,
    referenceCategory: null,
    confidence,
    referenceHeightM: refHeight,
    assessmentLevel: 'coarse_return_level',
    limitation:
      'Return levels are fitted to coarse mean-speed observations, not gust maxima; no IEC turbine class can be inferred.',
    summary:
      `50-year return level of the input mean-speed series: ${v50.toFixed(1)} m/s at ${heightLabel}. ` +
      'A one-year return level is undefined for this formulation and is not reported. ' +
      'No IEC turbine class is assigned. ' +
      `${dataNote} ` +
      `Based on ${annualMaxima.length} years of data.`,
  };
}

/**
 * Extract annual maximum wind speeds from historical data.
 */
function extractAnnualMaxima(
  data: MonthlyWindHistory | DailyWindData,
  heightKey: 'ws10m' | 'ws50m',
): Array<{ year: number; maxSpeedMs: number }> {
  const yearMaxMap = new Map<number, number>();

  if ('startYear' in data) {
    // MonthlyWindHistory
    for (const rec of data.records) {
      const speed = rec[heightKey];
      const current = yearMaxMap.get(rec.year) ?? 0;
      if (speed !== null && speed > current) {
        yearMaxMap.set(rec.year, speed);
      }
    }
  } else {
    // DailyWindData
    for (const rec of (data as DailyWindData).records) {
      const year = parseInt(rec.date.substring(0, 4), 10);
      const speed = rec[heightKey];
      const current = yearMaxMap.get(year) ?? 0;
      if (speed !== null && speed > current) {
        yearMaxMap.set(year, speed);
      }
    }
  }

  return [...yearMaxMap.entries()]
    .map(([year, maxSpeedMs]) => ({ year, maxSpeedMs }))
    .sort((a, b) => a.year - b.year);
}

/**
 * Fit a Gumbel Type I (maximum) distribution using the method of moments.
 *
 * The Gumbel distribution has CDF: F(x) = exp(-exp(-(x - mu) / sigma))
 *
 * Method of moments:
 * - mu = mean - gamma * sigma (where gamma = Euler-Mascheroni constant ~ 0.5772)
 * - sigma = (sqrt(6) / pi) * stddev
 */
export function fitGumbel(values: number[]): { mu: number; sigma: number } {
  const n = values.length;
  if (n === 0) return { mu: 0, sigma: 1 };

  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  const EULER_MASCHERONI = 0.5772156649;
  const sigma = (Math.sqrt(6) / Math.PI) * stddev;
  const mu = mean - EULER_MASCHERONI * sigma;

  return { mu: Math.max(mu, 0), sigma: Math.max(sigma, 0.01) };
}

/**
 * Compute the quantile (return period value) from a Gumbel distribution.
 *
 * V_T = mu - sigma * ln(-ln(1 - 1/T))
 *
 * @param mu - Location parameter
 * @param sigma - Scale parameter
 * @param returnPeriod - Return period in years (e.g. 50)
 */
export function gumbelQuantile(mu: number, sigma: number, returnPeriod: number): number {
  if (!Number.isFinite(returnPeriod) || returnPeriod <= 1) {
    throw new RangeError('Gumbel return period must be greater than one year.');
  }
  const p = 1 - 1 / returnPeriod;
  return mu - sigma * Math.log(-Math.log(p));
}

function assessConfidence(yearCount: number, isMonthlyData: boolean): 'high' | 'medium' | 'low' {
  if (isMonthlyData) {
    // Monthly data always has lower confidence for extremes
    return yearCount >= 20 ? 'medium' : 'low';
  }
  // Daily data
  if (yearCount >= 20) return 'high';
  if (yearCount >= 10) return 'medium';
  return 'low';
}

function insufficientDataResult(
  annualMaxima: Array<{ year: number; maxSpeedMs: number }>,
  heightKey: string,
): ExtremeWindResult {
  const refHeight = heightKey === 'ws50m' ? 50 : 10;
  return {
    annualMaxima,
    gumbelMu: 0,
    gumbelSigma: 0,
    v50YearMs: null,
    v1YearMs: null,
    referenceCategory: null,
    confidence: 'low',
    referenceHeightM: refHeight,
    assessmentLevel: 'unsupported',
    limitation: 'At least five annual maxima are required even for a coarse return-level fit.',
    summary: `Insufficient data for a coarse return-level fit (${annualMaxima.length} years, minimum 5 required).`,
  };
}
