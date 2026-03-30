import type { LatLng, FactorScore, SiteAnalysis } from './analysis.js';
import type { SiteConstraintReport } from './constraints.js';
import type { EnergyYieldResult } from './energy.js';
import type { TurbineLayoutEstimate } from './turbines.js';

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface SiteBoundary {
  id: string;
  name: string;
  polygon: LatLng[];
  areaSqKm: number;
  centroid: LatLng;
  boundingBox: BoundingBox;
}

export interface SamplePoint {
  coordinate: LatLng;
  analysis: SiteAnalysis;
  isExcluded: boolean;
  exclusionReasons: string[];
}

export interface AggregatedSiteScore {
  compositeScore: number;
  factorAverages: FactorScore[];
  viableAreaSqKm: number;
  viableAreaPercent: number;
  bestPoint: SamplePoint;
  worstPoint: SamplePoint;
  sampleCount: number;
  excludedCount: number;
}

export interface SiteAssessmentMetadata {
  analysedAt: string;
  durationMs: number;
  sampleSpacingKm: number;
  hubHeightM: number;
  sourcesUsed: string[];
  sourcesFailed: string[];
}

export interface SiteAssessment {
  boundary: SiteBoundary;
  samplePoints: SamplePoint[];
  aggregatedScore: AggregatedSiteScore;
  constraints: SiteConstraintReport;
  energyYield?: EnergyYieldResult;
  turbineLayout?: TurbineLayoutEstimate;
  metadata: SiteAssessmentMetadata;
}

// SiteConstraintReport, EnergyYieldResult, and TurbineLayoutEstimate are
// imported above for use in SiteAssessment. They are re-exported from
// their own type modules via types/index.ts.
