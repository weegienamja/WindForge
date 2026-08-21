import type {
  EnergyYieldResult,
  MonthlyWindHistory,
  ScoringError,
  SiteAnalysis,
} from '@jamieblair/windforge-core';

export interface AnalysisApiRequest {
  coordinate: { lat: number; lng: number };
  hubHeightM: number;
  turbineId: string;
}

export interface AnalysisApiResponse {
  analysis: SiteAnalysis;
  windHistory: {
    raw: MonthlyWindHistory;
    corrected: MonthlyWindHistory | null;
  } | null;
  energyYield: EnergyYieldResult | null;
  auxiliaryErrors: {
    windHistory: ScoringError | null;
    energyYield: ScoringError | null;
  };
}

export interface AnalysisApiError {
  error: ScoringError;
}
