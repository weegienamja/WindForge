import type { LatLng } from './analysis.js';

/** Solar position at a given time and location */
export interface SolarPosition {
  /** Solar azimuth in degrees (0 = North, clockwise) */
  azimuthDeg: number;
  /** Solar elevation above horizon in degrees (negative = below horizon) */
  elevationDeg: number;
  /** Whether the sun is above the horizon */
  isAboveHorizon: boolean;
}

/** Shadow flicker result for a single receptor */
export interface ReceptorFlicker {
  location: LatLng;
  /** Total potential shadow flicker hours per year (astronomical worst case) */
  hoursPerYear: number;
  /** Maximum flicker minutes per day for each month */
  minutesPerDay: Array<{ month: number; maxMinutes: number }>;
}

/** Overall shadow flicker analysis result */
export interface ShadowFlickerResult {
  receptors: ReceptorFlicker[];
  /** Worst-case hours per year across all receptors */
  worstCaseHoursPerYear: number;
  /** Human-readable summary */
  summary: string;
}

/** Options for a screening comparison with configurable shadow thresholds. */
export interface ShadowThresholdOptions {
  /** Maximum hours per year at any receptor (default: 30) */
  maxHoursPerYear?: number;
  /** Maximum minutes per day at any receptor (default: 30) */
  maxMinutesPerDay?: number;
  /** Sunshine fraction to convert astronomical to expected (default: 0.32 for UK) */
  sunshineFraction?: number;
}

/** Screening comparison with configured shadow-flicker thresholds. */
export interface ShadowThresholdAssessment {
  receptors: Array<{
    location: LatLng;
    astronomicalHoursPerYear: number;
    expectedHoursPerYear: number;
    maxMinutesPerDay: number;
    withinAnnualThreshold: boolean;
    withinDailyThreshold: boolean;
    withinAllThresholds: boolean;
  }>;
  overallWithinThresholds: boolean;
  worstCaseExpectedHoursPerYear: number;
  worstCaseMinutesPerDay: number;
  assessmentLevel: 'screening';
  disclaimer: string;
  summary: string;
}

/** @deprecated Use {@link ShadowThresholdOptions}. */
export type ShadowComplianceOptions = ShadowThresholdOptions;
/** @deprecated Use {@link ShadowThresholdAssessment}. */
export type ShadowComplianceAssessment = ShadowThresholdAssessment;

/** Shadow calendar entry for a single receptor - month x hour matrix */
export interface ShadowCalendarEntry {
  /** Month (1-12) */
  month: number;
  /** Hour of day (0-23) */
  hour: number;
  /** Number of days in this month/hour slot where flicker occurs */
  flickerDays: number;
}

/** Shadow calendar for a single receptor */
export interface ShadowCalendar {
  location: LatLng;
  /** 12 months x 24 hours matrix of flicker occurrence */
  entries: ShadowCalendarEntry[];
  /** Total hours of potential flicker */
  totalHours: number;
}
