export interface LatLng {
  lat: number;
  lng: number;
}

export type Confidence = 'high' | 'medium' | 'low';

export enum ScoringFactor {
  WindResource = 'windResource',
  TerrainSuitability = 'terrainSuitability',
  GridProximity = 'gridProximity',
  LandUseCompatibility = 'landUseCompatibility',
  PlanningFeasibility = 'planningFeasibility',
  AccessLogistics = 'accessLogistics',
}

export interface ScoringWeights {
  windResource: number;
  terrainSuitability: number;
  gridProximity: number;
  landUseCompatibility: number;
  planningFeasibility: number;
  accessLogistics: number;
}

export interface FactorScore {
  factor: ScoringFactor;
  score: number;
  weight: number;
  weightedScore: number;
  detail: string;
  dataSource: string;
  confidence: Confidence;
}

export interface Constraint {
  factor: ScoringFactor;
  description: string;
  severity: 'blocking' | 'severe';
}

export interface Warning {
  factor: ScoringFactor;
  description: string;
}

export interface AnalysisMetadata {
  analysedAt: string;
  dataFreshness: Record<string, string>;
  sourcesUsed: string[];
  sourcesFailed: string[];
  durationMs: number;
  hubHeightM: number;
  windShearAlpha: number;
  /** Why the shear exponent was selected; currently an explicit screening assumption. */
  windShearBasis: string;
  /** Whether enough required evidence was available to publish a composite score. */
  completeness: AnalysisCompleteness;
  /** Per-source evidence state, including failures that suppress the composite. */
  evidence: EvidenceStatus[];
  /**
   * Optional reanalysis bias-correction summary attached when the analysis
   * was reconciled against ERA5 or CERRA. Omits the corrected summary
   * itself (which is already reflected in the wind-resource factor).
   */
  reconciliation?: ReconciliationMetadata;
  /** Reanalysis sources an orchestrating caller attempted to supply/fetch. */
  reanalysisAttempted?: readonly ('era5' | 'cerra')[];
  /** Reanalysis sources successfully supplied to this analysis. */
  reanalysisSucceeded?: readonly ('era5' | 'cerra')[];
}

export type AnalysisCompletenessStatus =
  | 'complete'
  | 'degraded'
  | 'materially_incomplete'
  | 'indeterminate';

export interface AnalysisCompleteness {
  status: AnalysisCompletenessStatus;
  compositeEligible: boolean;
  missingRequiredFactors: ScoringFactor[];
  detail: string;
}

export interface EvidenceStatus {
  source: string;
  factor: ScoringFactor | 'reanalysis';
  status: 'available' | 'unavailable' | 'not_configured' | 'not_applied';
  requiredForComposite: boolean;
  detail: string;
}

export interface WindResourceResult {
  /** Unmodified NASA POWER summary. */
  raw: import('./datasources.js').WindDataSummary;
  /** The one summary used by both scoring and downstream energy calculations. */
  resolved: import('./datasources.js').WindDataSummary;
  primarySource: 'NASA POWER';
  correction: {
    status: 'applied' | 'not_configured' | 'not_applied' | 'unavailable';
    reference: 'era5' | 'cerra' | null;
    detail: string;
  };
}

/** Bias-correction summary surfaced on `AnalysisMetadata`. */
export interface ReconciliationMetadata {
  method: 'quantile' | 'variance' | 'linear' | 'none';
  reference: 'cerra' | 'era5' | null;
  diagnostics: {
    overlapMonths: number;
    biasBeforeMs: number;
    biasAfterMs: number;
    rmseBeforeMs: number;
    rmseAfterMs: number;
    rSquared: number;
    ksStatistic: number;
  } | null;
  confidence: Confidence;
  detail: string;
}

export interface SiteAnalysis {
  coordinate: LatLng;
  /** Null when any required scoring factor lacks evidence. */
  compositeScore: number | null;
  windResource: WindResourceResult | null;
  factors: FactorScore[];
  hardConstraints: Constraint[];
  warnings: Warning[];
  metadata: AnalysisMetadata;
}

export interface AnalysisOptions {
  coordinate: LatLng;
  weights?: Partial<ScoringWeights>;
  hubHeightM?: number;
  signal?: AbortSignal;
  /**
   * Optional pre-fetched reanalysis sources. When provided alongside a
   * successful NASA POWER fetch, the engine reconciles wind speeds via
   * `reconcileWindData` and uses the corrected summary for scoring.
   * The caller fetches and validates any reanalysis source itself.
   */
  reanalysis?: ReanalysisOverride;
  /**
   * @deprecated `analyseSite` does not perform hidden credential-backed
   * retrieval. Fetch reanalysis in trusted server code and pass `reanalysis`.
   */
  cdsApiKey?: string;
}

/** Pre-fetched reanalysis sources passed into {@link AnalysisOptions}. */
export interface ReanalysisOverride {
  era5?: ReanalysisSource | null;
  cerra?: ReanalysisSource | null;
}

/** Paired summary + monthly history for a reanalysis dataset. */
export interface ReanalysisSource {
  // Imported indirectly to avoid a circular type reference.
  summary: import('./datasources.js').WindDataSummary;
  history: import('./datasources.js').MonthlyWindHistory;
}
