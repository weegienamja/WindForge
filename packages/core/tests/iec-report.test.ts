import { describe, it, expect } from 'vitest';
import { generateIecSiteReport } from '../src/reporting/iec-report.js';
import type { SiteAssessment } from '../src/types/site.js';
import type { TurbulenceResult, ExtremeWindResult } from '../src/types/wind-assessment.js';
import type { EnergyYieldResult } from '../src/types/energy.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSiteAssessment(): SiteAssessment {
  return {
    boundary: {
      id: 'test-site',
      name: 'Example Wind Farm',
      polygon: [
        { lat: 55.80, lng: -4.30 },
        { lat: 55.85, lng: -4.30 },
        { lat: 55.85, lng: -4.22 },
        { lat: 55.80, lng: -4.22 },
      ],
      areaSqKm: 25,
      centroid: { lat: 55.825, lng: -4.26 },
      boundingBox: { north: 55.85, south: 55.80, east: -4.22, west: -4.30 },
    },
    samplePoints: [],
    aggregatedScore: {
      compositeScore: 72,
      factorAverages: [
        {
          factor: 'windResource' as const,
          score: 78,
          weight: 0.35,
          weightedScore: 27.3,
          detail: '7.2 m/s at hub height, direction 265 deg',
          dataSource: 'NASA POWER',
          confidence: 'high' as const,
        },
      ],
      viableAreaSqKm: 20,
      viableAreaPercent: 80,
      bestPoint: {
        coordinate: { lat: 55.83, lng: -4.26 },
        analysis: {
          coordinate: { lat: 55.83, lng: -4.26 },
          compositeScore: 78,
          factors: [
            {
              factor: 'windResource' as const,
              score: 85,
              weight: 0.35,
              weightedScore: 29.75,
              detail: '7.5 m/s at hub height',
              dataSource: 'NASA POWER',
              confidence: 'high' as const,
            },
          ],
          hardConstraints: [],
          warnings: [],
          metadata: {
            analysedAt: '2024-01-01T00:00:00Z',
            dataSources: ['NASA POWER'],
            hubHeightM: 80,
            windShearAlpha: 0.14,
            sourcesFailed: [],
          },
        },
        isExcluded: false,
        exclusionReasons: [],
      },
      worstPoint: {
        coordinate: { lat: 55.81, lng: -4.29 },
        analysis: {
          coordinate: { lat: 55.81, lng: -4.29 },
          compositeScore: 60,
          factors: [],
          hardConstraints: [],
          warnings: [],
          metadata: {
            analysedAt: '2024-01-01T00:00:00Z',
            dataSources: ['NASA POWER'],
            hubHeightM: 80,
            windShearAlpha: 0.14,
            sourcesFailed: [],
          },
        },
        isExcluded: false,
        exclusionReasons: [],
      },
      sampleCount: 10,
      excludedCount: 2,
    },
    constraints: {
      hardConstraints: [],
      softConstraints: [
        {
          definition: {
            id: 'residential',
            name: 'Residential',
            severity: 'soft' as const,
            category: 'residential' as const,
            description: 'Residential area within setback',
          },
          location: { lat: 55.83, lng: -4.27 },
          distanceFromSiteM: 400,
          distanceFromCentroidM: 800,
          detail: 'Residential area 400m from boundary',
        },
      ],
      infoConstraints: [],
      exclusionZones: [],
      nearestReceptors: {
        nearestDwellingM: 400,
        nearestSettlementM: 1200,
        nearestProtectedAreaM: 5000,
        nearestSubstationM: 3000,
        nearestMajorRoadM: 800,
        nearestExistingWindFarmM: null,
        nearestWaterbodyM: 2000,
        nearestRailwayM: null,
      },
      summary: {
        totalHard: 0,
        totalSoft: 1,
        totalInfo: 0,
        viableAreaPercent: 80,
        topBlocker: null,
        recommendation: 'proceed_with_caution' as const,
        reasoning: 'Residential area nearby',
      },
    },
    metadata: {
      analysedAt: '2024-01-01T00:00:00Z',
      durationMs: 5000,
      sampleSpacingKm: 0.5,
      hubHeightM: 80,
      sourcesUsed: ['NASA POWER', 'Open Elevation', 'Overpass'],
      sourcesFailed: [],
    },
  };
}

function makeTurbulenceResult(): TurbulenceResult {
  return {
    meanTi: 0.12,
    tiBins: [
      { speedBinMs: 5, ti: 0.18, count: 100 },
      { speedBinMs: 10, ti: 0.14, count: 200 },
      { speedBinMs: 15, ti: 0.11, count: 150 },
    ],
    iecClass: 'B' as const,
    representativeTi: 0.13,
    dataSource: 'hourly' as const,
    summary: 'IEC class B turbulence',
  };
}

function makeExtremeWindResult(): ExtremeWindResult {
  return {
    annualMaxima: [
      { year: 2020, maxSpeedMs: 28 },
      { year: 2021, maxSpeedMs: 30 },
    ],
    gumbelMu: 25,
    gumbelSigma: 3.5,
    v50YearMs: 38.5,
    v1YearMs: 25.2,
    iecWindClass: 'III' as const,
    confidence: 'medium' as const,
    referenceHeightM: 80,
    summary: 'IEC wind class III',
  };
}

function makeAepResult(): EnergyYieldResult {
  return {
    turbineModel: {
      id: 'v110',
      manufacturer: 'Vestas',
      model: 'V110-2.0',
      ratedPowerKw: 2000,
      rotorDiameterM: 110,
    },
    hubHeightM: 80,
    turbineCount: 5,
    grossAepMwh: 6000,
    grossTotalAepMwh: 30000,
    grossCapacityFactor: 0.34,
    losses: {
      wakeLossPct: 5,
      electricalLossPct: 2,
      availabilityLossPct: 3,
      environmentalLossPct: 1,
      icingLossPct: 0.5,
      hysteresisLossPct: 0.5,
      gridCurtailmentPct: 1,
      totalLossPct: 13,
      items: [],
    },
    netAepMwh: 5220,
    netTotalAepMwh: 26100,
    netCapacityFactor: 0.30,
    p50: { label: 'P50', aepMwh: 5220, totalAepMwh: 26100, capacityFactor: 0.30, description: '' },
    p75: { label: 'P75', aepMwh: 4800, totalAepMwh: 24000, capacityFactor: 0.27, description: '' },
    p90: { label: 'P90', aepMwh: 4400, totalAepMwh: 22000, capacityFactor: 0.25, description: '' },
    monthlyProductionMwh: [500, 480, 450, 400, 380, 350, 340, 360, 400, 450, 470, 490],
    assumptions: {
      windDataYears: 20,
      referenceHeightM: 50,
      extrapolationMethod: 'Power law alpha = 0.14',
      airDensityKgM3: 1.225,
      weibullK: 2.1,
      weibullC: 7.8,
      lossAssumptions: 'Standard',
      uncertaintyMethod: 'Combined',
    },
    confidence: 'high' as const,
    summary: 'Good energy yield',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IEC Site Report', () => {
  it('generates valid report structure', () => {
    const report = generateIecSiteReport(
      makeSiteAssessment(),
      makeTurbulenceResult(),
      makeExtremeWindResult(),
      makeAepResult(),
    );

    expect(report.metadata.standard).toContain('IEC 61400');
    expect(report.metadata.siteId).toBe('test-site');
    expect(report.metadata.siteName).toBe('Example Wind Farm');
    expect(report.metadata.generatedAt).toBeTruthy();
  });

  it('populates wind conditions correctly', () => {
    const report = generateIecSiteReport(
      makeSiteAssessment(),
      makeTurbulenceResult(),
      makeExtremeWindResult(),
      makeAepResult(),
    );

    expect(report.windConditions.annualMeanSpeedMs).toBe(7.2);
    expect(report.windConditions.hubHeightM).toBe(80);
    expect(report.windConditions.measurementHeightM).toBe(50);
    expect(report.windConditions.dataYears).toBe(20);
  });

  it('populates turbulence data', () => {
    const report = generateIecSiteReport(
      makeSiteAssessment(),
      makeTurbulenceResult(),
      makeExtremeWindResult(),
      makeAepResult(),
    );

    expect(report.turbulence.iecClass).toBe('B');
    expect(report.turbulence.representativeTi).toBe(0.13);
    expect(report.turbulence.meanTi).toBe(0.12);
    expect(report.turbulence.tiBins).toHaveLength(3);
  });

  it('populates extreme wind data', () => {
    const report = generateIecSiteReport(
      makeSiteAssessment(),
      makeTurbulenceResult(),
      makeExtremeWindResult(),
      makeAepResult(),
    );

    expect(report.extremeWind.v50YearMs).toBe(38.5);
    expect(report.extremeWind.v1YearMs).toBe(25.2);
    expect(report.extremeWind.iecWindClass).toBe('III');
    expect(report.extremeWind.gumbelMu).toBe(25);
    expect(report.extremeWind.gumbelSigma).toBe(3.5);
  });

  it('populates energy yield data', () => {
    const report = generateIecSiteReport(
      makeSiteAssessment(),
      makeTurbulenceResult(),
      makeExtremeWindResult(),
      makeAepResult(),
    );

    expect(report.energyYield.grossAepMwh).toBe(30000);
    expect(report.energyYield.netAepMwh).toBe(26100);
    expect(report.energyYield.capacityFactor).toBe(0.30);
    expect(report.energyYield.turbineCount).toBe(5);
    expect(report.energyYield.turbineModel).toBe('Vestas V110-2.0');
    expect(report.energyYield.p50AepMwh).toBe(26100);
    expect(report.energyYield.p75AepMwh).toBe(24000);
    expect(report.energyYield.p90AepMwh).toBe(22000);
  });

  it('populates suitability from assessment', () => {
    const report = generateIecSiteReport(
      makeSiteAssessment(),
      makeTurbulenceResult(),
      makeExtremeWindResult(),
      makeAepResult(),
    );

    expect(report.suitability.compositeScore).toBe(72);
    expect(report.suitability.viableAreaSqKm).toBe(20);
    expect(report.suitability.viableAreaPercent).toBe(80);
    expect(report.suitability.hardConstraintCount).toBe(0);
    expect(report.suitability.softConstraintCount).toBe(1);
    expect(report.suitability.recommendation).toBe('proceed_with_caution');
  });

  it('extracts wind shear from assumptions string', () => {
    const report = generateIecSiteReport(
      makeSiteAssessment(),
      makeTurbulenceResult(),
      makeExtremeWindResult(),
      makeAepResult(),
    );

    expect(report.windConditions.windShearExponent).toBe(0.14);
  });

  it('handles missing wind speed in factor details', () => {
    const assessment = makeSiteAssessment();
    assessment.aggregatedScore.factorAverages = []; // no factors

    const report = generateIecSiteReport(
      assessment,
      makeTurbulenceResult(),
      makeExtremeWindResult(),
      makeAepResult(),
    );

    expect(report.windConditions.annualMeanSpeedMs).toBe(0);
  });

  it('omits dataReconciliation when no reconciliation is provided', () => {
    const report = generateIecSiteReport(
      makeSiteAssessment(),
      makeTurbulenceResult(),
      makeExtremeWindResult(),
      makeAepResult(),
    );
    expect(report.dataReconciliation).toBeUndefined();
  });

  it('attaches reconciliation diagnostics when provided', () => {
    const assessment = makeSiteAssessment();
    const correctedSummary = {
      coordinate: { lat: 55.86, lng: -4.25 },
      monthlyAverages: [],
      annualAverageSpeedMs: 7.2,
      speedStdDevMs: 1.0,
      prevailingDirectionDeg: 240,
      directionalConsistency: 0.7,
      dataYears: 1,
    };
    const report = generateIecSiteReport(
      assessment,
      makeTurbulenceResult(),
      makeExtremeWindResult(),
      makeAepResult(),
      {
        corrected: correctedSummary,
        method: 'quantile',
        reference: 'cerra',
        confidence: 'high',
        detail: 'Reconciled against CERRA over 36 months.',
        diagnostics: {
          overlapMonths: 36,
          biasBeforeMs: 0.4,
          biasAfterMs: 0.02,
          rmseBeforeMs: 0.5,
          rmseAfterMs: 0.15,
          rSquared: 0.92,
          ksStatistic: 0.08,
        },
      },
    );

    expect(report.dataReconciliation).toBeDefined();
    expect(report.dataReconciliation?.method).toBe('quantile');
    expect(report.dataReconciliation?.reference).toBe('cerra');
    expect(report.dataReconciliation?.overlapMonths).toBe(36);
    expect(report.dataReconciliation?.biasAfterMs).toBeCloseTo(0.02);
    expect(report.dataReconciliation?.rmseAfterMs).toBeCloseTo(0.15);
    expect(report.dataReconciliation?.confidence).toBe('high');
    expect(report.dataReconciliation?.detail).toContain('CERRA');
  });
});
