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
  /**
   * Optional reanalysis bias-correction summary attached when the analysis
   * was reconciled against ERA5 or CERRA. Omits the corrected summary
   * itself (which is already reflected in the wind-resource factor).
   */
  reconciliation?: ReconciliationMetadata;
  /** Reanalysis sources the engine attempted to fetch automatically. */
  reanalysisAttempted?: readonly ('era5' | 'cerra')[];
  /** Reanalysis sources the engine successfully fetched. */
  reanalysisSucceeded?: readonly ('era5' | 'cerra')[];
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
  compositeScore: number;
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
   * The caller fetches ERA5 / CERRA themselves (these require API keys).
   */
  reanalysis?: ReanalysisOverride;
  /**
   * Optional CDS API key. When provided (or when `CDS_API_KEY` is set in
   * the environment), the engine will automatically fetch ERA5 and (where
   * applicable) CERRA monthly history and reconcile NASA POWER against
   * them. Ignored if `reanalysis` is also supplied.
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
