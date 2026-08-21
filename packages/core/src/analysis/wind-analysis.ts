import type {
  MonthlyWindRecord,
  MonthlyWindHistory,
  DailyWindRecord,
  DailyWindData,
  HourlyWindRecord,
  HourlyWindData,
  WindTrendResult,
  TrendPoint,
  SeasonalHeatmapCell,
  SeasonalHeatmapResult,
  BoxPlotData,
  DiurnalPoint,
  DiurnalProfileResult,
  SpeedDistributionResult,
  SpeedDistributionBin,
} from '../types/datasources.js';

// ─── Wind Trend (linear regression over monthly data) ───

export function computeWindTrend(history: MonthlyWindHistory): WindTrendResult {
  const records = history.records.filter((record) => bestSpeed(record) !== null);
  if (records.length === 0) {
    return {
      points: [],
      slopePerYear: null,
      rSquared: null,
      trendDirection: 'indeterminate',
      trendMagnitude: null,
      summary: 'No usable wind-speed data available.',
    };
  }

  const speeds = records.map((r) => bestSpeed(r)!);
  const xs = records.map((r) => r.year + (r.month - 1) / 12);

  const { slope, intercept, rSquared } = linearRegression(xs, speeds);

  const points: TrendPoint[] = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    const s = speeds[i]!;
    const x = xs[i]!;
    points.push({
      year: rec.year,
      month: rec.month,
      speedMs: s,
      trendMs: slope * x + intercept,
    });
  }

  const slopePerDecade = slope * 10;
  const trendDirection: 'increasing' | 'decreasing' | 'stable' =
    Math.abs(slopePerDecade) < 0.1 ? 'stable' : slopePerDecade > 0 ? 'increasing' : 'decreasing';
  const trendMagnitude = Math.abs(slopePerDecade);
  const dirWord =
    trendDirection === 'stable'
      ? 'remained stable'
      : `${trendDirection} by ${trendMagnitude.toFixed(1)} m/s per decade`;
  const summary = `Wind speed at this site has ${dirWord} since ${records[0]!.year}.`;

  return { points, slopePerYear: slope, rSquared, trendDirection, trendMagnitude, summary };
}

// ─── Seasonal Heatmap (month × hour from hourly data) ───

export function computeSeasonalHeatmap(hourly: HourlyWindData): SeasonalHeatmapResult {
  const buckets = new Map<string, number[]>();

  for (const rec of hourly.records) {
    const month = Number.parseInt(rec.datetime.slice(5, 7), 10);
    const hour = Number.parseInt(rec.datetime.slice(11, 13), 10);
    const key = `${month}:${hour}`;
    const speed = bestHourlySpeed(rec);
    if (speed === null) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(speed);
  }

  const cells: SeasonalHeatmapCell[] = [];
  for (let month = 1; month <= 12; month++) {
    for (let hour = 0; hour < 24; hour++) {
      const arr = buckets.get(`${month}:${hour}`);
      if (arr && arr.length > 0) {
        cells.push({ month, hour, speedMs: arr.reduce((a, b) => a + b, 0) / arr.length });
      }
    }
  }

  const minSpeed = cells.reduce((m, c) => Math.min(m, c.speedMs), Number.POSITIVE_INFINITY);
  const maxSpeed = cells.reduce((m, c) => Math.max(m, c.speedMs), 0);

  // Compute seasonal averages (DJF, MAM, JJA, SON)
  const seasonMonths: Record<string, number[]> = {
    'Winter (Dec-Feb)': [12, 1, 2],
    'Spring (Mar-May)': [3, 4, 5],
    'Summer (Jun-Aug)': [6, 7, 8],
    'Autumn (Sep-Nov)': [9, 10, 11],
  };
  let bestSeason: string | null = null;
  let worstSeason: string | null = null;
  let bestAvg = -1;
  let worstAvg = Number.POSITIVE_INFINITY;
  for (const [name, months] of Object.entries(seasonMonths)) {
    const seasonCells = cells.filter((c) => months.includes(c.month));
    if (seasonCells.length === 0) continue;
    const avg = seasonCells.reduce((s, c) => s + c.speedMs, 0) / seasonCells.length;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestSeason = name;
    }
    if (avg < worstAvg) {
      worstAvg = avg;
      worstSeason = name;
    }
  }

  return {
    cells,
    minSpeed: minSpeed === Number.POSITIVE_INFINITY ? null : minSpeed,
    maxSpeed: cells.length === 0 ? null : maxSpeed,
    bestSeason,
    worstSeason,
  };
}

// ─── Monthly Box Plots ───

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function computeMonthlyBoxPlots(history: MonthlyWindHistory): BoxPlotData[] {
  const byMonth = new Map<number, number[]>();

  for (const rec of history.records) {
    const speed = bestSpeed(rec);
    if (speed === null) continue;
    if (!byMonth.has(rec.month)) byMonth.set(rec.month, []);
    byMonth.get(rec.month)!.push(speed);
  }

  const result: BoxPlotData[] = [];
  for (let month = 1; month <= 12; month++) {
    const vals = (byMonth.get(month) ?? []).sort((a, b) => a - b);
    const label = MONTH_LABELS[month - 1] ?? '';
    if (vals.length === 0) continue;
    const q1 = percentile(vals, 25);
    const q3 = percentile(vals, 75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const outliers = vals.filter((v) => v < lowerFence || v > upperFence);
    result.push({
      month,
      label,
      min: vals[0]!,
      q1,
      median: percentile(vals, 50),
      q3,
      max: vals[vals.length - 1]!,
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
      outliers,
    });
  }

  return result;
}

// ─── Diurnal Profile (avg speed by hour of day from hourly data) ───

export function computeDiurnalProfile(hourly: HourlyWindData): DiurnalProfileResult {
  const byHour = new Map<number, number[]>();

  for (const rec of hourly.records) {
    const hour = Number.parseInt(rec.datetime.slice(11, 13), 10);
    const speed = bestHourlySpeed(rec);
    if (speed === null) continue;
    if (!byHour.has(hour)) byHour.set(hour, []);
    byHour.get(hour)!.push(speed);
  }

  const hours: DiurnalPoint[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const vals = byHour.get(hour) ?? [];
    if (vals.length === 0) continue;
    hours.push({
      hour,
      meanSpeedMs: vals.reduce((a, b) => a + b, 0) / vals.length,
      minSpeedMs: Math.min(...vals),
      maxSpeedMs: Math.max(...vals),
    });
  }

  if (hours.length === 0) {
    return {
      hours: [],
      peakHour: null,
      troughHour: null,
      summary: 'No usable hourly wind-speed data available.',
    };
  }
  let peakHour: number | null = null;
  let troughHour: number | null = null;
  let peakSpeed = -1;
  let troughSpeed = Number.POSITIVE_INFINITY;
  for (const h of hours) {
    if (h.meanSpeedMs > peakSpeed) {
      peakSpeed = h.meanSpeedMs;
      peakHour = h.hour;
    }
    if (h.meanSpeedMs < troughSpeed) {
      troughSpeed = h.meanSpeedMs;
      troughHour = h.hour;
    }
  }

  const summary = `Wind peaks at ${String(peakHour).padStart(2, '0')}:00 (${peakSpeed.toFixed(1)} m/s) and is weakest at ${String(troughHour).padStart(2, '0')}:00 (${troughSpeed.toFixed(1)} m/s)`;

  return { hours, peakHour, troughHour, summary };
}

// ─── Speed Distribution with Weibull fit ───

export function computeSpeedDistribution(
  daily: DailyWindData,
  binWidth = 1,
): SpeedDistributionResult {
  const speeds = daily.records
    .map((r) => bestDailySpeed(r))
    .filter((speed): speed is number => speed !== null);

  if (speeds.length === 0) {
    return {
      bins: [],
      weibullK: null,
      weibullC: null,
      meanSpeed: null,
      medianSpeed: null,
      summary: 'No usable wind-speed data available.',
    };
  }

  const maxSpeed = Math.ceil(Math.max(...speeds));
  const numBins = Math.max(1, Math.ceil(maxSpeed / binWidth));

  const counts = new Array<number>(numBins).fill(0);
  for (const s of speeds) {
    const bin = Math.min(Math.floor(s / binWidth), numBins - 1);
    counts[bin] = (counts[bin] ?? 0) + 1;
  }

  const { k, c } = fitWeibull(speeds);

  const bins: SpeedDistributionBin[] = counts.map((count, i) => {
    const binStart = i * binWidth;
    const binEnd = binStart + binWidth;
    const frequency = count / speeds.length;
    const weibullFrequency = weibullPdf(binStart + binWidth / 2, k, c) * binWidth;
    return { binStart, binEnd, frequency, weibullFrequency };
  });

  const meanSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const sorted = [...speeds].sort((a, b) => a - b);
  const medianSpeed = percentile(sorted, 50);
  const consistency = k >= 2.5 ? 'Good' : k >= 1.5 ? 'Moderate' : 'Low';
  const summary = `Weibull distribution: k=${k.toFixed(2)}, c=${c.toFixed(2)} m/s. ${consistency} consistency.`;

  return { bins, weibullK: k, weibullC: c, meanSpeed, medianSpeed, summary };
}

// ─── Year-over-year comparison ───

export interface YearOverYearEntry {
  year: number;
  annualMeanMs: number;
  monthlyMeans: Array<number | null>;
}

export function computeYearOverYear(history: MonthlyWindHistory): YearOverYearEntry[] {
  const byYear = new Map<number, Map<number, number[]>>();

  for (const rec of history.records) {
    const speed = bestSpeed(rec);
    if (speed === null) continue;
    if (!byYear.has(rec.year)) byYear.set(rec.year, new Map());
    const monthMap = byYear.get(rec.year)!;
    if (!monthMap.has(rec.month)) monthMap.set(rec.month, []);
    monthMap.get(rec.month)!.push(speed);
  }

  const result: YearOverYearEntry[] = [];
  const years = [...byYear.keys()].sort((a, b) => a - b);

  for (const year of years) {
    const monthMap = byYear.get(year)!;
    const monthlyMeans: Array<number | null> = [];
    for (let m = 1; m <= 12; m++) {
      const vals = monthMap.get(m) ?? [];
      monthlyMeans.push(vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
    }
    const allVals = [...monthMap.values()].flatMap((v) => v);
    const annualMeanMs =
      allVals.length > 0 ? allVals.reduce((a, b) => a + b, 0) / allVals.length : 0;
    result.push({ year, annualMeanMs, monthlyMeans });
  }

  return result;
}

// ─── Internal helpers ───

function bestSpeed(r: MonthlyWindRecord): number | null {
  if (r.ws50m !== null && r.ws50m >= 0) return r.ws50m;
  if (r.ws10m !== null && r.ws10m >= 0) return r.ws10m;
  return r.ws2m !== null && r.ws2m >= 0 ? r.ws2m : null;
}

function bestHourlySpeed(r: HourlyWindRecord): number | null {
  if (r.ws50m !== null && r.ws50m >= 0) return r.ws50m;
  if (r.ws10m !== null && r.ws10m >= 0) return r.ws10m;
  return r.ws2m !== null && r.ws2m >= 0 ? r.ws2m : null;
}

function bestDailySpeed(r: DailyWindRecord): number | null {
  if (r.ws50m !== null && r.ws50m >= 0) return r.ws50m;
  if (r.ws10m !== null && r.ws10m >= 0) return r.ws10m;
  return r.ws2m !== null && r.ws2m >= 0 ? r.ws2m : null;
}

function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const frac = index - lower;
  if (lower + 1 >= sorted.length) return sorted[lower] ?? 0;
  return (sorted[lower] ?? 0) * (1 - frac) + (sorted[lower + 1] ?? 0) * frac;
}

function linearRegression(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number; rSquared: number } {
  const n = xs.length;
  if (n === 0) return { slope: 0, intercept: 0, rSquared: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const xi = xs[i] ?? 0;
    const yi = ys[i] ?? 0;
    sumX += xi;
    sumY += yi;
    sumXY += xi * yi;
    sumX2 += xi * xi;
    sumY2 += yi * yi;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const ssTot = sumY2 - (sumY * sumY) / n;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * (xs[i] ?? 0) + intercept;
    ssRes += ((ys[i] ?? 0) - predicted) ** 2;
  }

  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, rSquared };
}

function fitWeibull(speeds: number[]): { k: number; c: number } {
  const n = speeds.length;
  if (n === 0) return { k: 2, c: 1 };

  const meanSpeed = speeds.reduce((a, b) => a + b, 0) / n;
  const variance = speeds.reduce((sum, s) => sum + (s - meanSpeed) ** 2, 0) / n;

  if (meanSpeed === 0) return { k: 2, c: 1 };

  const cv = Math.sqrt(variance) / meanSpeed;

  const k = cv > 0 ? (1.086 / cv) ** (1 / 0.93) : 2;
  const c = meanSpeed / gammaApprox(1 + 1 / k);

  return { k: Math.max(0.5, Math.min(k, 10)), c: Math.max(0.1, c) };
}

function weibullPdf(v: number, k: number, c: number): number {
  if (v < 0 || c <= 0 || k <= 0) return 0;
  return (k / c) * (v / c) ** (k - 1) * Math.exp(-((v / c) ** k));
}

function gammaApprox(z: number): number {
  // Lanczos approximation for Gamma function
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gammaApprox(1 - z));
  }
  const zm1 = z - 1;
  const coeffs = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  let acc = coeffs[0] ?? 0;
  for (let i = 1; i < coeffs.length; i++) {
    acc += (coeffs[i] ?? 0) / (zm1 + i);
  }
  const t = zm1 + coeffs.length - 1.5;
  return Math.sqrt(2 * Math.PI) * t ** (zm1 + 0.5) * Math.exp(-t) * acc;
}
