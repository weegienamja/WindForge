// IEC 61400-1 / IEC 61400-12-1 site conditions report generator.
//
// Structures site assessment outputs into a format aligned with IEC standards
// for wind turbine generator systems. Produces a pure data structure, not a
// PDF - consumers can format it using ExportButton or other renderers.

import type { SiteAssessment } from '../types/site.js';
import type { TurbulenceResult, ExtremeWindResult } from '../types/wind-assessment.js';
import type { EnergyYieldResult } from '../types/energy.js';
import type { ReconciledWindData } from '../types/reconciliation.js';

/** IEC site conditions report */
export interface IecSiteReport {
  /** Report metadata */
  metadata: {
    generatedAt: string;
    standard: string;
    siteId: string;
    siteName: string;
  };

  /** Annual mean wind conditions */
  windConditions: {
    annualMeanSpeedMs: number;
    hubHeightM: number;
    measurementHeightM: number;
    windShearExponent: number;
    prevailingDirectionDeg: number;
    dataYears: number;
  };

  /** Turbulence intensity per IEC 61400-1 */
  turbulence: {
    /** Representative TI at 15 m/s */
    representativeTi: number;
    /** Mean TI across all bins */
    meanTi: number;
    /** IEC turbulence class (A/B/C) */
    iecClass: string;
    /** TI per wind speed bin */
    tiBins: Array<{ speedBinMs: number; ti: number; count: number }>;
  };

  /** Extreme wind speeds per IEC 61400-1 */
  extremeWind: {
    /** 50-year return period speed at reference height (m/s) */
    v50YearMs: number;
    /** 1-year return period speed (m/s) */
    v1YearMs: number;
    /** Gumbel distribution parameters */
    gumbelMu: number;
    gumbelSigma: number;
    /** IEC wind class (I/II/III/S) */
    iecWindClass: string;
    /** Confidence */
    confidence: string;
  };

  /** Annual energy production summary */
  energyYield: {
    grossAepMwh: number;
    netAepMwh: number;
    capacityFactor: number;
    totalLossPct: number;
    p50AepMwh: number;
    p75AepMwh: number;
    p90AepMwh: number;
    turbineCount: number;
    turbineModel: string;
  };

  /** Site suitability summary */
  suitability: {
    compositeScore: number;
    viableAreaSqKm: number;
    viableAreaPercent: number;
    hardConstraintCount: number;
    softConstraintCount: number;
    recommendation: string;
  };

  /**
   * Optional reanalysis bias-correction summary. Present when the wind
   * resource was reconciled against ERA5 or CERRA via
   * {@link reconcileWindData}.
   */
  dataReconciliation?: {
    method: 'quantile' | 'variance' | 'linear' | 'none';
    reference: 'cerra' | 'era5' | null;
    overlapMonths: number;
    biasBeforeMs: number;
    biasAfterMs: number;
    rmseBeforeMs: number;
    rmseAfterMs: number;
    rSquared: number;
    ksStatistic: number;
    confidence: 'high' | 'medium' | 'low';
    detail: string;
  };
}

/**
 * Generate an IEC-aligned site conditions report.
 *
 * Combines data from the site assessment, turbulence analysis, extreme wind
 * estimation, and energy yield calculation into a structured report.
 *
 * Pass an optional `reconciliation` to attach bias-correction diagnostics
 * (lifts the report's wind-data confidence and is surfaced in the
 * `dataReconciliation` block).
 */
export function generateIecSiteReport(
  assessment: SiteAssessment,
  turbulence: TurbulenceResult,
  extremeWind: ExtremeWindResult,
  aep: EnergyYieldResult,
  reconciliation?: ReconciledWindData | null,
): IecSiteReport {
  const report: IecSiteReport = {
    metadata: {
      generatedAt: new Date().toISOString(),
      standard: 'IEC 61400-1 Ed.4 / IEC 61400-12-1 Ed.2',
      siteId: assessment.boundary.id,
      siteName: assessment.boundary.name,
    },

    windConditions: {
      annualMeanSpeedMs: assessment.aggregatedScore.factorAverages.length > 0
        ? extractWindSpeed(assessment)
        : 0,
      hubHeightM: aep.hubHeightM,
      measurementHeightM: aep.assumptions.referenceHeightM,
      windShearExponent: aep.assumptions.windDataYears > 0
        ? estimateShearFromAssumptions(aep)
        : 0.14,
      prevailingDirectionDeg: extractPrevailingDirection(assessment),
      dataYears: aep.assumptions.windDataYears,
    },

    turbulence: {
      representativeTi: turbulence.representativeTi,
      meanTi: turbulence.meanTi,
      iecClass: turbulence.iecClass,
      tiBins: turbulence.tiBins.map((b) => ({
        speedBinMs: b.speedBinMs,
        ti: b.ti,
        count: b.count,
      })),
    },

    extremeWind: {
      v50YearMs: extremeWind.v50YearMs,
      v1YearMs: extremeWind.v1YearMs,
      gumbelMu: extremeWind.gumbelMu,
      gumbelSigma: extremeWind.gumbelSigma,
      iecWindClass: extremeWind.iecWindClass,
      confidence: extremeWind.confidence,
    },

    energyYield: {
      grossAepMwh: aep.grossTotalAepMwh,
      netAepMwh: aep.netTotalAepMwh,
      capacityFactor: aep.netCapacityFactor,
      totalLossPct: aep.losses.totalLossPct,
      p50AepMwh: aep.p50.totalAepMwh,
      p75AepMwh: aep.p75.totalAepMwh,
      p90AepMwh: aep.p90.totalAepMwh,
      turbineCount: aep.turbineCount,
      turbineModel: `${aep.turbineModel.manufacturer} ${aep.turbineModel.model}`,
    },

    suitability: {
      compositeScore: assessment.aggregatedScore.compositeScore,
      viableAreaSqKm: assessment.aggregatedScore.viableAreaSqKm,
      viableAreaPercent: assessment.aggregatedScore.viableAreaPercent,
      hardConstraintCount: assessment.constraints.hardConstraints.length,
      softConstraintCount: assessment.constraints.softConstraints.length,
      recommendation: assessment.constraints.summary.recommendation,
    },
  };

  if (reconciliation && reconciliation.diagnostics) {
    report.dataReconciliation = {
      method: reconciliation.method,
      reference: reconciliation.reference,
      overlapMonths: reconciliation.diagnostics.overlapMonths,
      biasBeforeMs: reconciliation.diagnostics.biasBeforeMs,
      biasAfterMs: reconciliation.diagnostics.biasAfterMs,
      rmseBeforeMs: reconciliation.diagnostics.rmseBeforeMs,
      rmseAfterMs: reconciliation.diagnostics.rmseAfterMs,
      rSquared: reconciliation.diagnostics.rSquared,
      ksStatistic: reconciliation.diagnostics.ksStatistic,
      confidence: reconciliation.confidence,
      detail: reconciliation.detail,
    };
  }

  return report;
}

/** Extract approximate annual mean wind speed from assessment factor details */
function extractWindSpeed(assessment: SiteAssessment): number {
  const windFactor = assessment.aggregatedScore.factorAverages.find(
    (f) => f.factor === 'windResource',
  );
  if (!windFactor) return 0;

  // Try to extract speed from detail string (e.g., "7.2 m/s at hub height")
  const match = windFactor.detail.match(/([\d.]+)\s*m\/s/);
  return match ? parseFloat(match[1]!) : 0;
}

/** Extract prevailing wind direction from assessment */
function extractPrevailingDirection(assessment: SiteAssessment): number {
  const best = assessment.aggregatedScore.bestPoint;
  if (!best) return 270;
  const windFactor = best.analysis.factors.find((f) => f.factor === 'windResource');
  if (!windFactor) return 270;

  // Try to extract direction from metadata
  const dirMatch = windFactor.detail.match(/direction.*?([\d.]+)/i);
  return dirMatch ? parseFloat(dirMatch[1]!) : 270;
}

/** Estimate wind shear exponent from AEP assumptions */
function estimateShearFromAssumptions(aep: EnergyYieldResult): number {
  const desc = aep.assumptions.extrapolationMethod;
  const match = desc.match(/alpha\s*=?\s*([\d.]+)/i);
  return match ? parseFloat(match[1]!) : 0.14;
}
