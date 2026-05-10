export type {
  LatLng,
  Confidence,
  ScoringWeights,
  FactorScore,
  Constraint,
  Warning,
  AnalysisMetadata,
  ReconciliationMetadata,
  SiteAnalysis,
  AnalysisOptions,
  ReanalysisOverride,
  ReanalysisSource,
} from './analysis.js';

export { ScoringFactor } from './analysis.js';

export type { Result } from './result.js';
export { ok, err } from './result.js';

export type { ScoringError } from './errors.js';
export { ScoringErrorCode, scoringError } from './errors.js';

export type {
  BiasCorrectionMethod,
  ReferenceSource,
  ReconciledWindData,
  ReconciliationDiagnostics,
} from './reconciliation.js';

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
  OctaveBandSpl,
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

// --- Wake types ---
export type {
  WakeModelType,
  TurbinePosition,
  WakeDeficit,
  SectorWakeResult,
  TurbineWakeResult,
  WakeLossResult,
  WakeOptions,
} from './wake.js';

// --- Noise types ---
export type {
  GroundType,
  NoiseOptions,
  AttenuationBreakdown,
  TurbineNoiseContribution,
  NoiseResult,
  ElevationProfilePoint,
  ElevationProfile,
  BackgroundNoise,
  EtsuOptions,
  ReceptorAssessment,
  EtsuAssessment,
  NoiseContourCell,
  NoiseContourGrid,
} from './noise.js';

// --- Shadow types ---
export type {
  SolarPosition,
  ReceptorFlicker,
  ShadowFlickerResult,
  ShadowComplianceOptions,
  ShadowComplianceAssessment,
  ShadowCalendarEntry,
  ShadowCalendar,
} from './shadow.js';

// --- Terrain flow types ---
export type {
  ElevationGridPoint,
  ElevationGrid,
  SpeedUpPoint,
  SpeedUpGrid,
  RixResult,
} from './terrain.js';

// --- Wind assessment types ---
export type {
  TurbulenceBin,
  IecTurbulenceClass,
  TurbulenceResult,
  ExtremeWindResult,
} from './wind-assessment.js';

// --- Financial types ---
export type {
  FinancialParams,
  LcoeResult,
  IrrResult,
  PaybackResult,
  YearlyCashflow,
  CashflowProjection,
  ParameterVariation,
  SensitivityItem,
  SensitivityResult,
} from './financial.js';

// --- Met mast / on-site data types ---
export type {
  MetMastRecord,
  MetMastColumnConfig,
  FlaggedRecord,
  DataGap,
  MetMastDataset,
  DataQualityReport,
  McpResult,
} from './met-mast.js';
