export type {
  LatLng,
  Confidence,
  ScoringWeights,
  FactorScore,
  Constraint,
  Warning,
  AnalysisMetadata,
  SiteAnalysis,
  AnalysisOptions,
} from './analysis.js';

export { ScoringFactor } from './analysis.js';

export type { Result } from './result.js';
export { ok, err } from './result.js';

export type { ScoringError } from './errors.js';
export { ScoringErrorCode, scoringError } from './errors.js';

export type {
  WindDataPoint,
  WindDataSummary,
  MonthlyWindAverage,
  ElevationData,
  MonthlyWindRecord,
  MonthlyWindHistory,
  DailyWindRecord,
  DailyWindData,
  HourlyWindRecord,
  HourlyWindData,
  TrendPoint,
  WindTrendResult,
  SeasonalHeatmapCell,
  SeasonalHeatmapResult,
  BoxPlotData,
  DiurnalPoint,
  DiurnalProfileResult,
  SpeedDistributionBin,
  SpeedDistributionResult,
} from './datasources.js';

// --- Site assessment types ---
export type {
  BoundingBox,
  SiteBoundary,
  SamplePoint,
  AggregatedSiteScore,
  SiteAssessmentMetadata,
  SiteAssessment,
} from './site.js';

// --- Constraint types ---
export type {
  ConstraintSeverity,
  ConstraintCategory,
  ConstraintDefinition,
  DetectedConstraint,
  ExclusionZone,
  NearestReceptorTable,
  ConstraintSummary,
  SiteConstraintReport,
} from './constraints.js';

// --- Turbine types ---
export type {
  PowerCurvePoint,
  ThrustCurvePoint,
  TurbineModel,
  TurbineLayoutEstimate,
} from './turbines.js';

// --- Energy types ---
export type {
  LossItem,
  LossStack,
  PScenario,
  AepAssumptions,
  EnergyYieldResult,
  AepOptions,
  LossOverrides,
} from './energy.js';
