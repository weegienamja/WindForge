// Public API surface for @jamieblair/wind-site-intelligence-core

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
