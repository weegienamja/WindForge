// Public API surface for @jamieblair/windforge-core

// ─── Types ───

export type {
  /** Latitude/longitude coordinate pair. */
  LatLng,
  /** Confidence level for a scoring factor: 'high' | 'medium' | 'low'. */
  Confidence,
  /** Weight configuration for the six scoring factors (values should sum to 1). */
  ScoringWeights,
  /** Individual factor score with metadata and confidence. */
  FactorScore,
  /** Hard constraint that disqualifies a site. */
  Constraint,
  /** Soft warning that may affect site viability. */
  Warning,
  /** Metadata about an analysis run (timing, sources, parameters). */
  AnalysisMetadata,
  /** Complete site analysis result with composite score and factor breakdown. */
  SiteAnalysis,
  /** Input options for analyseSite(). */
  AnalysisOptions,
  /** Discriminated union result type: { ok: true; value: T } | { ok: false; error: E }. */
  Result,
  /** Structured scoring error with code and message. */
  ScoringError,
  /** Summary of wind data at a location (annual averages, direction, variability). */
  WindDataSummary,
  /** Monthly wind speed and direction average for a single month. */
  MonthlyWindAverage,
  /** Elevation and terrain data for a location. */
  ElevationData,
  /** Single year/month wind speed record at multiple heights. */
  MonthlyWindRecord,
  /** Full monthly wind history for a coordinate. */
  MonthlyWindHistory,
  /** Single daily wind speed record at multiple heights. */
  DailyWindRecord,
  /** Collection of daily wind records for a coordinate. */
  DailyWindData,
  /** Single hourly wind speed record. */
  HourlyWindRecord,
  /** Collection of hourly wind records for a coordinate. */
  HourlyWindData,
  /** A point on the wind trend line (month/year with speed and trend value). */
  TrendPoint,
  /** Result of wind trend computation with regression line, slope and R². */
  WindTrendResult,
  /** Single cell in the seasonal heatmap (month × hour with speed). */
  SeasonalHeatmapCell,
  /** Seasonal heatmap result with cells and best/worst season metadata. */
  SeasonalHeatmapResult,
  /** Monthly box plot statistics (min, q1, median, q3, max, outliers). */
  BoxPlotData,
  /** Hourly wind speed statistics (mean, min, max) for diurnal profile. */
  DiurnalPoint,
  /** Diurnal profile result with peak/trough hour metadata. */
  DiurnalProfileResult,
  /** Single bin in the wind speed frequency distribution. */
  SpeedDistributionBin,
  /** Wind speed distribution result with Weibull fit parameters. */
  SpeedDistributionResult,
} from './types/index.js';

/** Enumeration of the six scoring factors. */
export { ScoringFactor, ScoringErrorCode } from './types/index.js';
/** Helper constructors for Result<T, E> values. */
export { ok, err } from './types/index.js';

// ─── Scoring Engine ───

/** Run a full site suitability analysis for a given coordinate. */
export { analyseSite, normaliseWeights, computeCompositeScore, DEFAULT_WEIGHTS } from './scoring/index.js';

// ─── Data Source Clients ───

/** Fetch wind speed data from NASA POWER API. */
export { fetchWindData, fetchMonthlyWindHistory, fetchDailyWindData, fetchHourlyWindData, clearWindDataCache } from './datasources/index.js';
/** Fetch elevation and terrain data from Open-Elevation. */
export { fetchElevationData, clearElevationCache } from './datasources/index.js';
/** Fetch infrastructure, land use and access data from OpenStreetMap Overpass. */
export {
  fetchGridInfrastructure,
  fetchLandUse,
  fetchRoadAccess,
  fetchNearbyWindFarms,
  clearOverpassCaches,
} from './datasources/index.js';
export type {
  /** Nearby power grid infrastructure (substations, power lines). */
  GridInfrastructure,
  /** Land use analysis result with constraints. */
  LandUseResult,
  /** Hard land-use constraint (e.g. nature reserve, urban area). */
  LandUseConstraint,
  /** Soft land-use constraint (e.g. proximity to residential). */
  LandUseSoftConstraint,
  /** Road access details for a site. */
  RoadAccess,
  /** Nearby existing wind farm. */
  NearbyWindFarm,
} from './datasources/index.js';
/** Reverse-geocode a coordinate to an address via Nominatim. */
export { reverseGeocode, clearGeocodeCache } from './datasources/index.js';
export type {
  /** Result of reverse geocoding with display name and address components. */
  ReverseGeocodeResult,
} from './datasources/index.js';

// ─── Wind Analysis (chart-ready computations) ───

/** Compute wind speed trend with linear regression from monthly history. */
export {
  computeWindTrend,
  computeSeasonalHeatmap,
  computeMonthlyBoxPlots,
  computeDiurnalProfile,
  computeSpeedDistribution,
  computeYearOverYear,
} from './analysis/index.js';
export type {
  /** Year-over-year average wind speed entry. */
  YearOverYearEntry,
} from './analysis/index.js';

// ─── Utilities ───

/** Geographic and math utility functions. */
export { isValidCoordinate, distanceKm, clamp, linearScale, mean, standardDeviation } from './utils/index.js';
/** LRU cache factory with TTL support. */
export { createCache } from './utils/index.js';
export type { /** Generic cache interface. */ Cache } from './utils/index.js';
/** Wind shear power law extrapolation utilities. */
export { roughnessClassToAlpha, extrapolateWindSpeed, REFERENCE_HEIGHT_M, REFERENCE_HEIGHT_50M } from './utils/index.js';
/** Geometry utilities for polygon operations. */
export {
  isPointInPolygon,
  polygonAreaSqKm,
  polygonCentroid,
  pointToPolygonEdgeDistanceM,
  circleBufferPolygon,
  polygonOverlapAreaSqKm,
  expandBoundingBox,
  generateGridWithinPolygon,
  rotateGrid,
  computeBoundingBox,
} from './utils/index.js';

// ─── Site Assessment ───

export type {
  BoundingBox,
  SiteBoundary,
  SamplePoint,
  AggregatedSiteScore,
  SiteAssessmentMetadata,
  SiteAssessment,
} from './types/index.js';

/** Create and parse site boundaries. */
export { createBoundary, generateSampleGrid, parseBoundaryFromGeoJSON, parseBoundaryFromKML } from './site/index.js';
/** Assess a site boundary with multi-point analysis. */
export { assessSite } from './site/index.js';
export type { SiteAssessmentOptions } from './site/site-assessment.js';

// ─── Constraint Intelligence ───

export type {
  ConstraintSeverity,
  ConstraintCategory,
  ConstraintDefinition,
  DetectedConstraint,
  ExclusionZone,
  NearestReceptorTable,
  ConstraintSummary,
  SiteConstraintReport,
} from './types/index.js';

export {
  CONSTRAINT_DEFINITIONS,
  getConstraintDefinition,
  getMaxSetbackKm,
} from './constraints/index.js';
export { fetchConstraintData, clearConstraintCache } from './constraints/index.js';
export { detectConstraints } from './constraints/index.js';
export { computeExclusionZones } from './constraints/index.js';

// ─── Turbine Library ───

export type {
  PowerCurvePoint,
  ThrustCurvePoint,
  TurbineModel,
  TurbineLayoutEstimate,
} from './types/index.js';

export { getAllTurbines, getTurbineById, getTurbinesByPowerRange } from './turbines/index.js';
export { parsePowerCurveCSV } from './turbines/index.js';

// ─── Energy Yield ───

export type {
  LossItem,
  LossStack,
  PScenario,
  AepAssumptions,
  EnergyYieldResult,
  AepOptions,
  LossOverrides,
} from './types/index.js';

export { calculateAep } from './energy/index.js';
export { estimateTurbineCapacity } from './energy/index.js';
export { optimiseLayout } from './energy/index.js';
export type { OptimiserOptions, ConvergenceEntry, OptimisedLayoutResult } from './energy/index.js';

// ─── Wake Modelling ───

export type {
  WakeModelType,
  TurbinePosition,
  WakeDeficit,
  SectorWakeResult,
  TurbineWakeResult,
  WakeLossResult,
  WakeOptions,
} from './types/index.js';

export {
  calculateDirectionalWakeLoss,
  buildWindRose,
  layoutToTurbinePositions,
} from './wake/index.js';
export {
  jensenSingleWake,
  combinedWakeDeficit,
  computeJensenWakeField,
  wakeDecayFromRoughness,
  generateThrustCurveFromPower,
} from './wake/index.js';
export {
  bastankhahSingleWake,
  bastankhahExpansionFromRoughness,
  computeBastankhahWakeField,
} from './wake/index.js';

// ─── Noise Modelling ───

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
  OctaveBandSpl,
} from './types/index.js';

export {
  calculateNoiseAtReceptor,
  calculateNoiseSingleTurbine,
  logarithmicSum,
  geometricDivergence,
  atmosphericAbsorption,
  groundEffect,
  barrierAttenuation,
  slantDistance,
  assessNoiseCompliance,
  daytimeNoiseLimit,
  nightTimeNoiseLimit,
  computeNoiseContours,
} from './noise/index.js';

export {
  fetchElevationProfile,
  createElevationProfile,
  interpolateCoordinates,
} from './utils/elevation-profile.js';

// ─── Shadow Flicker ───

export type {
  SolarPosition,
  ReceptorFlicker,
  ShadowFlickerResult,
  ShadowComplianceOptions,
  ShadowComplianceAssessment,
  ShadowCalendarEntry,
  ShadowCalendar,
} from './types/index.js';

export {
  calculateSolarPosition,
  solarDeclination,
  dateToJulianDay,
  dayOfYear,
  calculateShadowFlicker,
  assessShadowCompliance,
  isFlickerOccurring,
  bearing,
  angleDifference,
  generateShadowCalendar,
  summariseShadowCalendar,
} from './shadow/index.js';

// ─── Terrain Flow Modelling ───

export type {
  ElevationGridPoint,
  ElevationGrid,
  SpeedUpPoint,
  SpeedUpGrid,
  RixResult,
} from './types/index.js';

export {
  fetchElevationGrid,
  generateGridCoordinates,
  createElevationGrid,
  clearElevationGridCache,
  computeTerrainSpeedUp,
  calculateRix,
  calculateRixGrid,
} from './terrain/index.js';

// ─── Wind Assessment (Turbulence & Extreme Wind) ───

export type {
  TurbulenceBin,
  IecTurbulenceClass,
  TurbulenceResult,
  ExtremeWindResult,
} from './types/index.js';

export {
  estimateTurbulenceIntensity,
  classifyTurbulence,
  estimateExtremeWind,
  fitGumbel,
  gumbelQuantile,
} from './analysis/index.js';

// ─── Financial Model ───

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
} from './types/index.js';

export {
  calculateLcoe,
  calculateIrr,
  calculatePayback,
  generateCashflow,
  resolveParams,
  DEFAULT_FINANCIAL_PARAMS,
  runSensitivityAnalysis,
  compareScenarios,
  DEFAULT_VARIATIONS,
} from './financial/index.js';

// ─── On-Site Data Integration (MCP) ───

export type {
  MetMastRecord,
  MetMastColumnConfig,
  FlaggedRecord,
  DataGap,
  MetMastDataset,
  DataQualityReport,
  McpResult,
} from './types/index.js';

export { parseMetMastCSV } from './datasources/index.js';

export { performMcpAnalysis } from './analysis/index.js';

export { assessDataQuality } from './analysis/index.js';

// ─── Reanalysis Bias Correction ───

export {
  reconcileWindData,
  alignByYearMonth,
  computeBias,
  computeRmse,
  computeRSquared,
  computeKsStatistic,
  applyVarianceScaling,
  applyQuantileMapping,
  applyLinearScaling,
} from './analysis/index.js';

export type {
  ReconciliationInput,
  ReconciliationSource,
} from './analysis/index.js';

export { fetchReconciledWindHistory } from './analysis/index.js';
export type {
  FetchReconciledWindHistoryOptions,
  ReconciledWindHistory,
} from './analysis/index.js';

export type {
  BiasCorrectionMethod,
  ReferenceSource,
  ReconciledWindData,
  ReconciliationDiagnostics,
  ReconciliationMetadata,
  ReanalysisOverride,
  ReanalysisSource,
} from './types/index.js';

// ─── Visual Impact (Viewshed) ───

export type { ViewshedCell, ViewshedResult } from './visual/index.js';

export { computeViewshed } from './visual/index.js';

// ─── Cumulative Impact ───

export type { ExistingTurbine, CumulativeImpactResult } from './cumulative/index.js';

export { assessCumulativeImpact } from './cumulative/index.js';

// ─── IEC Reporting ───

export type { IecSiteReport } from './reporting/index.js';

export { generateIecSiteReport } from './reporting/index.js';

// ─── ERA5 / CERRA Data Sources ───

export { fetchEra5WindData, uvToSpeedDirection, validateEra5ApiKey, clearEra5Cache, fetchEra5MonthlyHistory, parseEra5NetCdf } from './datasources/index.js';
export type { Era5Options, Era5HistoryOptions } from './datasources/index.js';

export { fetchCerraWindData, isInCerraDomain, clearCerraCache, fetchCerraMonthlyHistory, parseCerraNetCdf } from './datasources/index.js';
export type { CerraOptions, CerraHistoryOptions } from './datasources/index.js';

// ─── Spatial Cache ───

export { createSpatialCache, tileKey } from './cache/index.js';
export type { SpatialCache, SpatialDataType, CacheStats } from './cache/index.js';

// ─── Data Validation ───

export { validateWindData, validateElevationData, validateCoordinateArray } from './validation/index.js';
export type { ValidationResult } from './validation/index.js';
