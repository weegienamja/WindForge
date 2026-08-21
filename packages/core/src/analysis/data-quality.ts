import type { MetMastDataset, DataQualityReport } from '../types/met-mast.js';

/**
 * Assess the quality of a met mast dataset.
 *
 * Checks recovery rate, gap patterns, icing, stuck sensors,
 * and seasonal completeness to determine if the data is adequate
 * for reliable wind resource assessment.
 */
export function assessDataQuality(dataset: MetMastDataset): DataQualityReport {
  const recoveryPercent = Math.round(dataset.dataRecovery * 100 * 10) / 10;

  const totalGapHours = dataset.gaps.reduce((s, g) => s + g.durationHours, 0);
  const longestGapHours =
    dataset.gaps.length > 0 ? Math.max(...dataset.gaps.map((g) => g.durationHours)) : 0;

  const icingRecordCount = dataset.flaggedRecords.filter((f) => f.flagType === 'icing').length;
  const stuckSensorCount = dataset.flaggedRecords.filter(
    (f) => f.flagType === 'stuck_sensor',
  ).length;

  // Check seasonal completeness (at least some data in each calendar month)
  const monthsPresent = new Set<number>();
  for (const rec of dataset.records) {
    monthsPresent.add(rec.timestamp.getUTCMonth());
  }

  const seasonalCompleteness = Array.from({ length: 12 }, (_, i) => monthsPresent.has(i));
  const monthsWithData = [...monthsPresent].sort((a, b) => a - b);

  // Adequacy assessment
  const isAdequate =
    recoveryPercent >= 70 &&
    monthsWithData.length >= 10 &&
    longestGapHours < 720 && // no gap > 30 days
    dataset.records.length >= 4380; // ~6 months of hourly data

  const issues: string[] = [];
  if (recoveryPercent < 70) issues.push(`low recovery (${recoveryPercent}%)`);
  if (monthsWithData.length < 12) issues.push(`missing months: ${12 - monthsWithData.length}`);
  if (longestGapHours > 168) issues.push(`long gap: ${longestGapHours.toFixed(0)}h`);
  if (icingRecordCount > 0) issues.push(`${icingRecordCount} icing records`);
  if (stuckSensorCount > 0) issues.push(`${stuckSensorCount} stuck sensor records`);

  const summary = isAdequate
    ? `Data quality: adequate. Recovery: ${recoveryPercent}%. ` +
      `${dataset.gaps.length} gaps totalling ${totalGapHours.toFixed(0)} hours. ` +
      `${monthsWithData.length}/12 months represented.`
    : `Data quality: inadequate. Issues: ${issues.join('; ')}. ` + `Recovery: ${recoveryPercent}%.`;

  return {
    recoveryPercent,
    gapCount: dataset.gaps.length,
    totalGapHours: Math.round(totalGapHours * 10) / 10,
    longestGapHours: Math.round(longestGapHours * 10) / 10,
    icingRecordCount,
    stuckSensorCount,
    seasonalCompleteness,
    monthsWithData,
    isAdequate,
    summary,
  };
}
