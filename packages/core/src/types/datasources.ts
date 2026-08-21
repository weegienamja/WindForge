import type { LatLng } from './analysis.js';

export interface WindDataPoint {
  year: number;
  month: number;
  windSpeedMs: number;
  windDirectionDeg: number;
}

export interface WindDataSummary {
  coordinate: LatLng;
  monthlyAverages: MonthlyWindAverage[];
  annualAverageSpeedMs: number;
  speedStdDevMs: number;
  prevailingDirectionDeg: number;
  directionalConsistency: number;
  dataYears: number;
  /** Reference measurement height in metres (2 or 50) */
  referenceHeightM?: number;
  /** Optional Weibull shape parameter `k` fitted from monthly speeds. */
  weibullK?: number;
  /** Optional Weibull scale parameter `c` (m/s) fitted from monthly speeds. */
  weibullC?: number;
}

export interface MonthlyWindAverage {
  month: number;
  averageSpeedMs: number;
  averageDirectionDeg: number;
}

export interface ElevationData {
  coordinate: LatLng;
  elevationM: number;
  slopePercent: number;
  aspectDeg: number;
  /** @deprecated Elevation-derived terrain-variation band; not aerodynamic roughness or land cover. */
  roughnessClass: number;
}

// --- Phase 4: Multi-height / multi-temporal types ---

/** A single monthly record with multi-height measurements */
export interface MonthlyWindRecord {
  year: number;
  month: number;
  ws2m: number | null;
  ws10m: number | null;
  ws50m: number | null;
  wd10m: number | null;
  wd50m: number | null;
}

/** Full monthly history across multiple years */
export interface MonthlyWindHistory {
  coordinate: LatLng;
  records: MonthlyWindRecord[];
  startYear: number;
  endYear: number;
}

/** A single daily record with multi-height measurements */
export interface DailyWindRecord {
  date: string; // YYYY-MM-DD
  ws2m: number | null;
  ws10m: number | null;
  ws50m: number | null;
  wd10m: number | null;
  wd50m: number | null;
}

/** Daily wind data for a date range */
export interface DailyWindData {
  coordinate: LatLng;
  records: DailyWindRecord[];
  startDate: string;
  endDate: string;
}

/** A single hourly record with multi-height measurements */
export interface HourlyWindRecord {
  datetime: string; // ISO 8601 e.g. 2024-01-15T14:00
  ws2m: number | null;
  ws10m: number | null;
  ws50m: number | null;
  wd10m: number | null;
  wd50m: number | null;
}

/** Hourly wind data for a date range */
export interface HourlyWindData {
  coordinate: LatLng;
  records: HourlyWindRecord[];
  startDate: string;
  endDate: string;
}

// --- Wind analysis chart-ready data structures ---

export interface TrendPoint {
  year: number;
  month: number;
  speedMs: number;
  trendMs: number;
}

export interface WindTrendResult {
  points: TrendPoint[];
  slopePerYear: number | null;
  rSquared: number | null;
  trendDirection: 'increasing' | 'decreasing' | 'stable' | 'indeterminate';
  trendMagnitude: number | null;
  summary: string;
}

export interface SeasonalHeatmapCell {
  month: number;
  hour: number;
  speedMs: number;
}

export interface SeasonalHeatmapResult {
  cells: SeasonalHeatmapCell[];
  minSpeed: number | null;
  maxSpeed: number | null;
  bestSeason: string | null;
  worstSeason: string | null;
}

export interface BoxPlotData {
  month: number;
  label: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  outliers: number[];
}

export interface DiurnalPoint {
  hour: number;
  meanSpeedMs: number;
  minSpeedMs: number;
  maxSpeedMs: number;
}

export interface DiurnalProfileResult {
  hours: DiurnalPoint[];
  peakHour: number | null;
  troughHour: number | null;
  summary: string;
}

export interface SpeedDistributionBin {
  binStart: number;
  binEnd: number;
  frequency: number;
  weibullFrequency: number;
}

export interface SpeedDistributionResult {
  bins: SpeedDistributionBin[];
  weibullK: number | null;
  weibullC: number | null;
  meanSpeed: number | null;
  medianSpeed: number | null;
  summary: string;
}
