import type { SiteAnalysis } from '@jamieblair/windforge-core';
import { ScoringFactor } from '@jamieblair/windforge-core';

const baseFactor = (factor: ScoringFactor, score: number, detail: string) => ({
  factor,
  score,
  weight: 0.16,
  weightedScore: score * 0.16,
  detail,
  dataSource: 'fixture',
  confidence: 'medium' as const,
});

/**
 * Glasgow-area site, reanalysis bias-corrected against CERRA.
 */
export const glasgowReconciled: SiteAnalysis = {
  coordinate: { lat: 55.86, lng: -4.25 },
  compositeScore: 72,
  factors: [
    baseFactor(
      ScoringFactor.WindResource,
      78,
      '4.3 m/s at 2m, 7.2 m/s at 50m, 8.6 m/s at 100m hub height',
    ),
    baseFactor(ScoringFactor.TerrainSuitability, 65, 'Moderate slope, open grassland.'),
    baseFactor(
      ScoringFactor.GridProximity,
      70,
      'Nearest 132kV line 6.4 km, nearest substation 11.0 km.',
    ),
    baseFactor(ScoringFactor.LandUseCompatibility, 80, 'Farmland, no protected areas within 2 km.'),
    baseFactor(ScoringFactor.PlanningFeasibility, 60, 'Moderate planning context.'),
    baseFactor(
      ScoringFactor.AccessLogistics,
      75,
      'Primary road A82 within 2 km, secondary network nearby.',
    ),
  ],
  hardConstraints: [],
  warnings: [
    {
      factor: ScoringFactor.LandUseCompatibility,
      description: 'Residential settlement 480 m to the south, noise buffer assessment recommended.',
    },
  ],
  metadata: {
    analysedAt: '2026-05-10T10:00:00.000Z',
    dataFreshness: { 'nasa-power': '2026-04-01' },
    sourcesUsed: ['nasa-power', 'open-elevation', 'osm-overpass', 'cerra'],
    sourcesFailed: [],
    durationMs: 4720,
    hubHeightM: 100,
    windShearAlpha: 0.14,
    reanalysisAttempted: ['era5', 'cerra'] as const,
    reanalysisSucceeded: ['cerra'] as const,
    reconciliation: {
      method: 'quantile',
      reference: 'cerra',
      diagnostics: {
        overlapMonths: 132,
        biasBeforeMs: -0.42,
        biasAfterMs: 0.03,
        rmseBeforeMs: 0.91,
        rmseAfterMs: 0.34,
        rSquared: 0.86,
        ksStatistic: 0.07,
      },
      confidence: 'high',
      detail: 'CERRA reconciliation succeeded with 132-month overlap.',
    },
  },
};

/**
 * English site without reanalysis reconciliation.
 */
export const englandNoReconciliation: SiteAnalysis = {
  coordinate: { lat: 52.05, lng: -1.34 },
  compositeScore: 58,
  factors: [
    baseFactor(
      ScoringFactor.WindResource,
      55,
      '3.6 m/s at 2m, estimated 7.1 m/s at 100m hub height (no bias correction).',
    ),
    baseFactor(ScoringFactor.TerrainSuitability, 70, 'Gently rolling Cotswold terrain.'),
    baseFactor(
      ScoringFactor.GridProximity,
      62,
      'Nearest 132kV line 12.8 km, nearest substation 18.5 km.',
    ),
    baseFactor(ScoringFactor.LandUseCompatibility, 50, 'Farmland with scattered villages.'),
    baseFactor(ScoringFactor.PlanningFeasibility, 45, 'Mixed planning history in the region.'),
    baseFactor(ScoringFactor.AccessLogistics, 68, 'Secondary road network within 4 km.'),
  ],
  hardConstraints: [],
  warnings: [],
  metadata: {
    analysedAt: '2026-05-10T10:05:00.000Z',
    dataFreshness: { 'nasa-power': '2026-04-01' },
    sourcesUsed: ['nasa-power', 'open-elevation', 'osm-overpass'],
    sourcesFailed: ['cerra'],
    durationMs: 5210,
    hubHeightM: 100,
    windShearAlpha: 0.18,
    reanalysisAttempted: ['era5', 'cerra'] as const,
    reanalysisSucceeded: [] as const,
  },
};

/**
 * Site with two hard constraints: protected habitat plus airport buffer.
 */
export const constrainedSite: SiteAnalysis = {
  coordinate: { lat: 51.47, lng: -0.45 },
  compositeScore: 18,
  factors: [
    baseFactor(ScoringFactor.WindResource, 60, '6.8 m/s at hub height.'),
    baseFactor(ScoringFactor.TerrainSuitability, 55, 'Flat lowland.'),
    baseFactor(ScoringFactor.GridProximity, 80, 'Substation 3 km.'),
    baseFactor(
      ScoringFactor.LandUseCompatibility,
      5,
      'Within Heathrow safeguarding zone, aviation hard constraint.',
    ),
    baseFactor(ScoringFactor.PlanningFeasibility, 10, 'Designated SSSI overlap.'),
    baseFactor(ScoringFactor.AccessLogistics, 70, 'Trunk road within 1 km.'),
  ],
  hardConstraints: [
    {
      factor: ScoringFactor.LandUseCompatibility,
      description: 'Heathrow Airport aviation safeguarding zone.',
      severity: 'blocking',
    },
    {
      factor: ScoringFactor.PlanningFeasibility,
      description: 'Site of Special Scientific Interest overlap.',
      severity: 'severe',
    },
  ],
  warnings: [],
  metadata: {
    analysedAt: '2026-05-10T10:10:00.000Z',
    dataFreshness: { 'nasa-power': '2026-04-01' },
    sourcesUsed: ['nasa-power', 'open-elevation', 'osm-overpass'],
    sourcesFailed: [],
    durationMs: 4980,
    hubHeightM: 100,
    windShearAlpha: 0.16,
  },
};
