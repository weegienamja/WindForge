/** Turbulence intensity result for a wind speed bin */
export interface TurbulenceBin {
  /** Centre wind speed of the bin (m/s) */
  speedBinMs: number;
  /** Mean turbulence intensity (0-1) */
  ti: number;
  /** Number of records in this bin */
  count: number;
}

/** IEC 61400-1 reference threshold category. Not a turbine-class determination. */
export type TurbulenceReferenceCategory = 'A' | 'B' | 'C' | 'exceeds_A';

/** Screening variability result. Coarse provider data cannot establish IEC turbulence intensity. */
export interface TurbulenceResult {
  /** Mean hourly-variability proxy across all bins, or null when unsupported */
  meanTi: number | null;
  /** TI per wind speed bin */
  tiBins: TurbulenceBin[];
  /** Optional reference threshold; null for provider-derived proxy results */
  referenceCategory: TurbulenceReferenceCategory | null;
  /** Hourly-variability proxy at 15 m/s, or null when unsupported */
  representativeTi: number | null;
  /** Data source used */
  dataSource: 'hourly' | 'daily_unsupported';
  assessmentLevel: 'variability_proxy' | 'unsupported';
  limitation: string;
  /** Human-readable summary */
  summary: string;
}

/** Extreme wind estimation result */
export interface ExtremeWindResult {
  /** Annual maximum wind speeds extracted from the data */
  annualMaxima: Array<{ year: number; maxSpeedMs: number }>;
  /** Gumbel Type I location parameter */
  gumbelMu: number;
  /** Gumbel Type I scale parameter */
  gumbelSigma: number;
  /** 50-year return level for the input series, or null when unavailable */
  v50YearMs: number | null;
  /** Reserved legacy field; null because a one-year Gumbel return level is undefined */
  v1YearMs: null;
  /** No IEC class is inferred from coarse provider data */
  referenceCategory: null;
  /** Confidence in the estimate */
  confidence: 'high' | 'medium' | 'low';
  /** Height at which values are reported (m) */
  referenceHeightM: number;
  assessmentLevel: 'coarse_return_level' | 'unsupported';
  limitation: string;
  /** Human-readable summary */
  summary: string;
}
