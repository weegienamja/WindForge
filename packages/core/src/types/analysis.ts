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
}
