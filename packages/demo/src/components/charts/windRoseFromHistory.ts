import type { MonthlyWindHistory } from '@jamieblair/windforge-core';
import {
  COMPASS_DIRECTIONS,
  DEFAULT_WIND_BANDS,
  degreesToCompass,
  emptyRoseData,
  type WindRoseDirectionData,
  type WindSpeedBand,
} from '@jamieblair/windforge';

/**
 * Bucket monthly wind history records into 16-point compass directions
 * and the supplied speed bands. Frequencies are returned as percentages
 * of the total record count so the rose visualises directional + speed
 * distribution together. Uses 50m direction + 50m speed when available,
 * falling back to the 10m series.
 */
export function windRoseFromHistory(
  history: MonthlyWindHistory,
  bands: WindSpeedBand[] = DEFAULT_WIND_BANDS,
): WindRoseDirectionData[] {
  const rows = emptyRoseData(bands);
  let usableRecords = 0;

  const indexByDirection = new Map(COMPASS_DIRECTIONS.map((d, i) => [d, i] as const));

  for (const record of history.records) {
    const pair =
      record.ws50m !== null && record.wd50m !== null
        ? { speed: record.ws50m, direction: record.wd50m }
        : record.ws10m !== null && record.wd10m !== null
          ? { speed: record.ws10m, direction: record.wd10m }
          : null;
    if (pair === null) continue;
    const { speed, direction } = pair;
    const compass = degreesToCompass(direction);
    const rowIndex = indexByDirection.get(compass);
    if (rowIndex === undefined) continue;
    const row = rows[rowIndex];
    if (!row) continue;
    const band = bands.find((b) => speed >= b.minMs && speed < b.maxMs);
    if (!band) continue;
    const current = (row[band.label] as number | undefined) ?? 0;
    row[band.label] = current + 1;
    usableRecords += 1;
  }

  if (usableRecords === 0) return rows;

  // Convert raw counts into percentages of the total sample.
  for (const row of rows) {
    for (const band of bands) {
      const count = (row[band.label] as number | undefined) ?? 0;
      row[band.label] = (count / usableRecords) * 100;
    }
  }
  return rows;
}
