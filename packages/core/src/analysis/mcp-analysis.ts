import type { Result } from '../types/result.js';
import type { ScoringError } from '../types/errors.js';
import { ok, err } from '../types/result.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type { MonthlyWindHistory } from '../types/datasources.js';
import type { MetMastDataset, McpResult } from '../types/met-mast.js';

/**
 * Perform Measure-Correlate-Predict (MCP) analysis.
 *
 * Correlates short-term on-site measurements with a long-term reference dataset
 * (NASA POWER) during their concurrent period, then applies the regression to
 * the full reference record to predict the long-term on-site wind climate.
 *
 * @param onSite - On-site met mast dataset
 * @param reference - Long-term reference data (NASA POWER monthly history)
 * @param referenceHeightKey - Which reference height to correlate against (default: 'ws50m')
 */
export function performMcpAnalysis(
  onSite: MetMastDataset,
  reference: MonthlyWindHistory,
  referenceHeightKey: 'ws10m' | 'ws50m' = 'ws50m',
): Result<McpResult, ScoringError> {
  // Aggregate on-site data to monthly means
  const onSiteMonthly = aggregateToMonthlyMeans(onSite);

  if (onSiteMonthly.length < 6) {
    return err(
      scoringError(
        ScoringErrorCode.InsufficientData,
        `Need at least 6 months of on-site data for MCP analysis, got ${onSiteMonthly.length}`,
      ),
    );
  }

  // Find concurrent period
  const concurrent = findConcurrentPeriod(onSiteMonthly, reference, referenceHeightKey);

  if (concurrent.length < 6) {
    return err(
      scoringError(
        ScoringErrorCode.InsufficientData,
        `Only ${concurrent.length} concurrent months found between on-site and reference data. Need at least 6.`,
      ),
    );
  }

  // Compute linear regression: onSite = slope * reference + intercept
  const { slope, intercept, rSquared, standardError } = linearRegression(
    concurrent.map((c) => c.refSpeed),
    concurrent.map((c) => c.onSiteSpeed),
  );

  // Calculate on-site measured mean
  const measuredMean = onSiteMonthly.reduce((s, m) => s + m.speedMs, 0) / onSiteMonthly.length;

  // Apply regression to full reference record to predict long-term on-site climate
  const longTermMonthlyMeans = reference.records.flatMap((rec) => {
    const refSpeed = rec[referenceHeightKey];
    return refSpeed === null || refSpeed <= 0
      ? []
      : [
          {
            year: rec.year,
            month: rec.month,
            predictedSpeedMs: Math.max(0, slope * refSpeed + intercept),
          },
        ];
  });

  if (longTermMonthlyMeans.length === 0) {
    return err(
      scoringError(
        ScoringErrorCode.InsufficientData,
        'Reference history has no usable long-term wind-speed records.',
      ),
    );
  }

  const predictedLongTermMean =
    longTermMonthlyMeans.reduce((s, m) => s + m.predictedSpeedMs, 0) / longTermMonthlyMeans.length;

  const adjustmentFactor = measuredMean > 0 ? predictedLongTermMean / measuredMean : 1;

  // Confidence assessment
  let confidence: 'high' | 'medium' | 'low';
  if (rSquared >= 0.8 && concurrent.length >= 12) {
    confidence = 'high';
  } else if (rSquared >= 0.6 && concurrent.length >= 6) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  const summary =
    `MCP analysis: R-squared = ${rSquared.toFixed(3)} over ${concurrent.length} concurrent months. ` +
    `Measured mean: ${measuredMean.toFixed(2)} m/s. ` +
    `Predicted long-term mean: ${predictedLongTermMean.toFixed(2)} m/s ` +
    `(adjustment factor: ${adjustmentFactor.toFixed(3)}). ` +
    `Confidence: ${confidence}.`;

  return ok({
    correlationR2: Math.round(rSquared * 10000) / 10000,
    predictedLongTermMeanMs: Math.round(predictedLongTermMean * 100) / 100,
    adjustmentFactor: Math.round(adjustmentFactor * 1000) / 1000,
    longTermMonthlyMeans,
    concurrentPeriodMonths: concurrent.length,
    regressionSlope: Math.round(slope * 10000) / 10000,
    regressionIntercept: Math.round(intercept * 10000) / 10000,
    standardError: Math.round(standardError * 10000) / 10000,
    confidence,
    summary,
  });
}

// ─── Internal helpers ───

interface MonthlyMean {
  year: number;
  month: number;
  speedMs: number;
  count: number;
}

function aggregateToMonthlyMeans(dataset: MetMastDataset): MonthlyMean[] {
  const monthMap = new Map<string, { total: number; count: number; year: number; month: number }>();

  for (const rec of dataset.records) {
    const year = rec.timestamp.getUTCFullYear();
    const month = rec.timestamp.getUTCMonth() + 1;
    const key = `${year}-${month}`;

    const existing = monthMap.get(key);
    if (existing) {
      existing.total += rec.windSpeedMs;
      existing.count++;
    } else {
      monthMap.set(key, { total: rec.windSpeedMs, count: 1, year, month });
    }
  }

  return [...monthMap.values()]
    .map((m) => ({
      year: m.year,
      month: m.month,
      speedMs: m.total / m.count,
      count: m.count,
    }))
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

interface ConcurrentPair {
  year: number;
  month: number;
  onSiteSpeed: number;
  refSpeed: number;
}

function findConcurrentPeriod(
  onSiteMonthly: MonthlyMean[],
  reference: MonthlyWindHistory,
  heightKey: 'ws10m' | 'ws50m',
): ConcurrentPair[] {
  const refMap = new Map<string, number>();
  for (const rec of reference.records) {
    const speed = rec[heightKey];
    if (speed !== null) refMap.set(`${rec.year}-${rec.month}`, speed);
  }

  const pairs: ConcurrentPair[] = [];
  for (const m of onSiteMonthly) {
    const refSpeed = refMap.get(`${m.year}-${m.month}`);
    if (refSpeed !== undefined && refSpeed > 0 && m.speedMs > 0) {
      pairs.push({
        year: m.year,
        month: m.month,
        onSiteSpeed: m.speedMs,
        refSpeed,
      });
    }
  }

  return pairs;
}

/**
 * Simple least-squares linear regression: y = slope * x + intercept
 */
function linearRegression(
  x: number[],
  y: number[],
): { slope: number; intercept: number; rSquared: number; standardError: number } {
  const n = x.length;
  if (n < 2) {
    return { slope: 1, intercept: 0, rSquared: 0, standardError: Infinity };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i]!;
    sumY += y[i]!;
    sumXY += x[i]! * y[i]!;
    sumX2 += x[i]! * x[i]!;
    sumY2 += y[i]! * y[i]!;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-15) {
    return { slope: 0, intercept: sumY / n, rSquared: 0, standardError: Infinity };
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const meanY = sumY / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * x[i]! + intercept;
    ssRes += (y[i]! - predicted) ** 2;
    ssTot += (y[i]! - meanY) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // Standard error of the estimate
  const standardError = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;

  return { slope, intercept, rSquared, standardError };
}
