import type { Result } from '../types/result.js';
import type { ScoringError } from '../types/errors.js';
import { ok, err } from '../types/result.js';
import { ScoringErrorCode, scoringError } from '../types/errors.js';
import type {
  MetMastRecord,
  MetMastColumnConfig,
  MetMastDataset,
  FlaggedRecord,
  DataGap,
} from '../types/met-mast.js';

const DEFAULT_DELIMITER = ',';
const MIN_SPEED_MS = 0;
const MAX_SPEED_MS = 50;
const MIN_DIRECTION = 0;
const MAX_DIRECTION = 360;

/**
 * Parse a CSV string into a MetMastDataset.
 *
 * Validates each record for range limits, detects gaps, and flags quality issues.
 * Supports configurable column mapping and timestamp formats.
 */
export function parseMetMastCSV(
  csv: string,
  config: MetMastColumnConfig,
  siteId: string = 'site-1',
): Result<MetMastDataset, ScoringError> {
  if (!csv || csv.trim().length === 0) {
    return err(scoringError(ScoringErrorCode.DataUnavailable, 'CSV data is empty'));
  }

  const delimiter = config.delimiter ?? DEFAULT_DELIMITER;
  const hasHeader = config.hasHeader ?? true;

  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return err(scoringError(ScoringErrorCode.DataUnavailable, 'CSV contains no data rows'));
  }

  let headers: string[] | undefined;
  let dataStartIndex = 0;

  if (hasHeader) {
    headers = parseCsvLine(lines[0]!, delimiter);
    dataStartIndex = 1;
  }

  const records: MetMastRecord[] = [];
  const flaggedRecords: FlaggedRecord[] = [];
  let totalParsed = 0;

  for (let i = dataStartIndex; i < lines.length; i++) {
    const columns = parseCsvLine(lines[i]!, delimiter);
    totalParsed++;

    const timestampVal = getColumnValue(columns, config.timestamp, headers);
    const speedVal = getColumnValue(columns, config.windSpeed, headers);
    const directionVal = getColumnValue(columns, config.windDirection, headers);

    if (timestampVal === undefined || speedVal === undefined || directionVal === undefined) {
      continue; // skip rows with missing required fields
    }

    const timestamp = parseTimestamp(timestampVal, config.timestampFormat);
    if (!timestamp || isNaN(timestamp.getTime())) {
      continue;
    }

    const windSpeedMs = parseFloat(speedVal);
    const windDirectionDeg = parseFloat(directionVal);

    if (isNaN(windSpeedMs) || isNaN(windDirectionDeg)) {
      continue;
    }

    // Range validation
    if (windSpeedMs < MIN_SPEED_MS || windSpeedMs > MAX_SPEED_MS) {
      flaggedRecords.push({
        index: records.length,
        timestamp,
        flagType: 'range_exceeded',
        description: `Wind speed ${windSpeedMs} m/s outside valid range [${MIN_SPEED_MS}, ${MAX_SPEED_MS}]`,
      });
      continue;
    }

    if (windDirectionDeg < MIN_DIRECTION || windDirectionDeg > MAX_DIRECTION) {
      flaggedRecords.push({
        index: records.length,
        timestamp,
        flagType: 'range_exceeded',
        description: `Wind direction ${windDirectionDeg} deg outside valid range [${MIN_DIRECTION}, ${MAX_DIRECTION}]`,
      });
      continue;
    }

    const record: MetMastRecord = {
      timestamp,
      windSpeedMs,
      windDirectionDeg,
      heightM: config.heightM,
    };

    // Optional fields
    if (config.temperature !== undefined) {
      const tempVal = getColumnValue(columns, config.temperature, headers);
      if (tempVal) {
        const temp = parseFloat(tempVal);
        if (!isNaN(temp)) record.temperatureC = temp;
      }
    }
    if (config.pressure !== undefined) {
      const pressVal = getColumnValue(columns, config.pressure, headers);
      if (pressVal) {
        const press = parseFloat(pressVal);
        if (!isNaN(press)) record.pressureHpa = press;
      }
    }
    if (config.turbulenceIntensity !== undefined) {
      const tiVal = getColumnValue(columns, config.turbulenceIntensity, headers);
      if (tiVal) {
        const ti = parseFloat(tiVal);
        if (!isNaN(ti)) record.turbulenceIntensity = ti;
      }
    }

    records.push(record);
  }

  if (records.length === 0) {
    return err(scoringError(ScoringErrorCode.DataUnavailable, 'No valid records found in CSV'));
  }

  // Sort by timestamp
  records.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Detect gaps and stuck sensor/icing
  const gaps = detectGaps(records);
  detectStuckSensor(records, flaggedRecords);
  detectIcing(records, flaggedRecords);

  // Compute statistics
  const startDate = records[0]!.timestamp;
  const endDate = records[records.length - 1]!.timestamp;
  const totalHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
  const expectedRecords = totalHours; // assuming hourly data
  const dataRecovery = expectedRecords > 0 ? Math.min(records.length / expectedRecords, 1) : 0;
  const meanSpeedMs = records.reduce((sum, r) => sum + r.windSpeedMs, 0) / records.length;

  return ok({
    records,
    siteId,
    heightM: config.heightM,
    startDate,
    endDate,
    dataRecovery: Math.round(dataRecovery * 1000) / 1000,
    meanSpeedMs: Math.round(meanSpeedMs * 100) / 100,
    totalRecordsParsed: totalParsed,
    flaggedRecords,
    gaps,
  });
}

// ─── Internal helpers ───

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function getColumnValue(
  columns: string[],
  key: string | number,
  headers?: string[],
): string | undefined {
  if (typeof key === 'number') {
    return columns[key];
  }
  if (headers) {
    const idx = headers.findIndex((h) => h.trim().toLowerCase() === key.toLowerCase());
    if (idx >= 0) return columns[idx];
  }
  return undefined;
}

function parseTimestamp(value: string, format?: string): Date | undefined {
  if (!format || format === 'iso') {
    // Try ISO 8601 parsing
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }

  if (format === 'dd/mm/yyyy hh:mm' || format === 'dd/mm/yyyy HH:mm') {
    // Parse UK-style date format
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (match) {
      const [, day, month, year, hour, minute] = match;
      return new Date(
        Date.UTC(
          parseInt(year!, 10),
          parseInt(month!, 10) - 1,
          parseInt(day!, 10),
          parseInt(hour!, 10),
          parseInt(minute!, 10),
        ),
      );
    }
  }

  if (format === 'yyyy-mm-dd hh:mm' || format === 'yyyy-mm-dd HH:mm') {
    const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
    if (match) {
      const [, year, month, day, hour, minute] = match;
      return new Date(
        Date.UTC(
          parseInt(year!, 10),
          parseInt(month!, 10) - 1,
          parseInt(day!, 10),
          parseInt(hour!, 10),
          parseInt(minute!, 10),
        ),
      );
    }
  }

  // Fallback: try native Date parsing
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d;

  return undefined;
}

function detectGaps(records: MetMastRecord[]): DataGap[] {
  const gaps: DataGap[] = [];
  const expectedIntervalMs = 60 * 60 * 1000; // 1 hour
  const gapThreshold = expectedIntervalMs * 2; // >2 hours is a gap

  for (let i = 1; i < records.length; i++) {
    const interval = records[i]!.timestamp.getTime() - records[i - 1]!.timestamp.getTime();
    if (interval > gapThreshold) {
      gaps.push({
        startTime: records[i - 1]!.timestamp,
        endTime: records[i]!.timestamp,
        durationHours: interval / (1000 * 60 * 60),
      });
    }
  }

  return gaps;
}

function detectStuckSensor(records: MetMastRecord[], flagged: FlaggedRecord[]): void {
  // Stuck sensor: 6+ consecutive identical speed readings (not calm)
  const minRunLength = 6;
  let runStart = 0;
  let runSpeed = records[0]?.windSpeedMs ?? -1;

  for (let i = 1; i < records.length; i++) {
    if (records[i]!.windSpeedMs === runSpeed) {
      if (i - runStart + 1 >= minRunLength && runSpeed > 0.5) {
        flagged.push({
          index: i,
          timestamp: records[i]!.timestamp,
          flagType: 'stuck_sensor',
          description: `${i - runStart + 1} consecutive identical readings at ${runSpeed} m/s`,
        });
      }
    } else {
      runStart = i;
      runSpeed = records[i]!.windSpeedMs;
    }
  }
}

function detectIcing(records: MetMastRecord[], flagged: FlaggedRecord[]): void {
  // Icing: zero or near-zero speed with temperature below 0
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    if (rec.windSpeedMs < 0.5 && rec.temperatureC !== undefined && rec.temperatureC < 0) {
      flagged.push({
        index: i,
        timestamp: rec.timestamp,
        flagType: 'icing',
        description: `Zero speed (${rec.windSpeedMs} m/s) at ${rec.temperatureC}C - possible icing`,
      });
    }
  }
}
