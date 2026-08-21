import type { LatLng } from './analysis.js';
import type { SupportedGeometry } from '../utils/feature-geometry.js';

export type ConstraintSeverity = 'hard' | 'soft' | 'info';

export type ConstraintCategory =
  | 'environmental'
  | 'aviation'
  | 'military'
  | 'heritage'
  | 'residential'
  | 'infrastructure'
  | 'water'
  | 'terrain';

export interface ConstraintDefinition {
  id: string;
  name: string;
  severity: ConstraintSeverity;
  category: ConstraintCategory;
  defaultSetbackM?: number;
  description: string;
}

export interface DetectedConstraint {
  definition: ConstraintDefinition;
  /** Source geometry preserved from Overpass; never reduced to its centroid for analysis. */
  geometry: SupportedGeometry;
  location: LatLng;
  distanceFromSiteM: number;
  distanceFromCentroidM: number;
  affectedAreaSqKm?: number;
  osmFeatureId?: string;
  evidenceSource: 'OpenStreetMap';
  evidenceQuality: 'screening';
  detail: string;
}

export interface ExclusionZone {
  reason: string;
  polygon: LatLng[];
  holes?: LatLng[][];
  areaSqKm: number;
}

export interface NearestReceptorTable {
  nearestDwellingM: number | null;
  nearestSettlementM: number | null;
  nearestProtectedAreaM: number | null;
  nearestSubstationM: number | null;
  nearestMajorRoadM: number | null;
  nearestExistingWindFarmM: number | null;
  nearestWaterbodyM: number | null;
  nearestRailwayM: number | null;
}

export interface ConstraintSummary {
  totalHard: number;
  totalSoft: number;
  totalInfo: number;
  viableAreaPercent: number;
  topBlocker: string | null;
  recommendation: 'proceed' | 'proceed_with_caution' | 'significant_concerns' | 'likely_unviable';
  reasoning: string;
}

export interface SiteConstraintReport {
  hardConstraints: DetectedConstraint[];
  softConstraints: DetectedConstraint[];
  infoConstraints: DetectedConstraint[];
  exclusionZones: ExclusionZone[];
  nearestReceptors: NearestReceptorTable;
  summary: ConstraintSummary;
}
