// Legacy filename retained for source compatibility. This module structures
// screening outputs into a pure data report; it does not produce an IEC report.

import type { SiteAssessment } from '../types/site.js';
import type { TurbulenceResult, ExtremeWindResult } from '../types/wind-assessment.js';
import type { EnergyYieldResult } from '../types/energy.js';
import type { ReconciledWindData } from '../types/reconciliation.js';

/** Screening-level site report */
export interface ScreeningSiteReport {
  /** Report metadata */
  metadata: {
    generatedAt: string;
    standard: string;
    assessmentLevel: 'screening';
    disclaimer: string;
    siteId: string;
    siteName: string;
  };

  /** Annual mean wind conditions */
  windConditions: {
    annualMeanSpeedMs: number | null;
    hubHeightM: number;
    measurementHeightM: number;
    windShearExponent: number;
    prevailingDirectionDeg: number | null;
    dataYears: number;
  };

  /** Provider-data variability proxy; not IEC turbulence intensity */
  turbulence: {
    representativeTi: number | null;
    meanTi: number | null;
    referenceCategory: string | null;
    /** TI per wind speed bin */
    tiBins: Array<{ speedBinMs: number; ti: number; count: number }>;
  };

  /** Coarse return-level screen; not an IEC extreme-wind assessment */
  extremeWind: {
    v50YearMs: number | null;
    v1YearMs: null;
    /** Gumbel distribution parameters */
    gumbelMu: number;
    gumbelSigma: number;
    referenceCategory: null;
    /** Confidence */
    confidence: string;
  };

  /** Annual energy production summary */
  energyYield: {
    grossAepMwh: number;
    netAepMwh: number;
    capacityFactor: number;
    totalLossPct: number;
    centralEstimateMwh: number;
    downside10Mwh: number;
    downside20Mwh: number;
    turbineCount: number;
    turbineModel: string;
  };

  /** Site suitability summary */
  suitability: {
    compositeScore: number | null;
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
 * Generate a screening-level site report.
 *
 * Combines data from the site assessment, turbulence analysis, extreme wind
 * estimation, and energy yield calculation into a structured report.
 *
 * Pass an optional `reconciliation` to attach bias-correction diagnostics
 * (lifts the report's wind-data confidence and is surfaced in the
 * `dataReconciliation` block).
 */
export function generateScreeningSiteReport(
  assessment: SiteAssessment,
  turbulence: TurbulenceResult,
  extremeWind: ExtremeWindResult,
  aep: EnergyYieldResult,
  reconciliation?: ReconciledWindData | null,
): ScreeningSiteReport {
  const report: ScreeningSiteReport = {
    metadata: {
      generatedAt: new Date().toISOString(),
      standard: 'Screening-level model outputs',
      assessmentLevel: 'screening',
      disclaimer:
        'Not an IEC compliance assessment, site suitability study, certified energy assessment, or engineering design.',
      siteId: assessment.boundary.id,
      siteName: assessment.boundary.name,
    },

    windConditions: {
      annualMeanSpeedMs:
        assessment.aggregatedScore.factorAverages.length > 0 ? extractWindSpeed(assessment) : null,
      hubHeightM: aep.hubHeightM,
      measurementHeightM: aep.assumptions.referenceHeightM,
      windShearExponent:
        aep.assumptions.windDataYears > 0 ? estimateShearFromAssumptions(aep) : 0.14,
      prevailingDirectionDeg: extractPrevailingDirection(assessment),
      dataYears: aep.assumptions.windDataYears,
    },

    turbulence: {
      representativeTi: turbulence.representativeTi,
      meanTi: turbulence.meanTi,
      referenceCategory: turbulence.referenceCategory,
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
      referenceCategory: extremeWind.referenceCategory,
      confidence: extremeWind.confidence,
    },

    energyYield: {
      grossAepMwh: aep.grossTotalAepMwh,
      netAepMwh: aep.netTotalAepMwh,
      capacityFactor: aep.netCapacityFactor,
      totalLossPct: aep.losses.totalLossPct,
      centralEstimateMwh: aep.centralEstimate.totalAepMwh,
      downside10Mwh: aep.downside10.totalAepMwh,
      downside20Mwh: aep.downside20.totalAepMwh,
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

/** @deprecated Use ScreeningSiteReport; this alias remains for source compatibility. */
export type IecSiteReport = ScreeningSiteReport;

/** @deprecated Use generateScreeningSiteReport. */
export const generateIecSiteReport = generateScreeningSiteReport;

/** Extract approximate annual mean wind speed from assessment factor details */
function extractWindSpeed(assessment: SiteAssessment): number | null {
  const windFactor = assessment.aggregatedScore.factorAverages.find(
    (f) => f.factor === 'windResource',
  );
  if (!windFactor) return null;

  // Try to extract speed from detail string (e.g., "7.2 m/s at hub height")
  const match = windFactor.detail.match(/([\d.]+)\s*m\/s/);
  return match ? parseFloat(match[1]!) : null;
}

/** Extract prevailing wind direction from assessment */
function extractPrevailingDirection(assessment: SiteAssessment): number | null {
  const best = assessment.aggregatedScore.bestPoint;
  if (!best) return null;
  const windFactor = best.analysis.factors.find((f) => f.factor === 'windResource');
  if (!windFactor) return null;

  // Try to extract direction from metadata
  const dirMatch = windFactor.detail.match(/direction.*?([\d.]+)/i);
  return dirMatch ? parseFloat(dirMatch[1]!) : null;
}

/** Estimate wind shear exponent from AEP assumptions */
function estimateShearFromAssumptions(aep: EnergyYieldResult): number {
  const desc = aep.assumptions.extrapolationMethod;
  const match = desc.match(/alpha\s*=?\s*([\d.]+)/i);
  return match ? parseFloat(match[1]!) : 0.14;
}
