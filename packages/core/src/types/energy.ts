export interface LossItem {
  name: string;
  percent: number;
  description: string;
  isUserOverridable: boolean;
}

export interface LossStack {
  wakeLossPct: number;
  electricalLossPct: number;
  availabilityLossPct: number;
  environmentalLossPct: number;
  icingLossPct: number;
  hysteresisLossPct: number;
  gridCurtailmentPct: number;
  totalLossPct: number;
  items: LossItem[];
}

export interface SensitivityScenario {
  label: string;
  aepMwh: number;
  totalAepMwh: number;
  capacityFactor: number;
  description: string;
}

export interface AepAssumptions {
  windDataYears: number;
  referenceHeightM: number;
  extrapolationMethod: string;
  airDensityKgM3: number;
  weibullK: number;
  weibullC: number;
  lossAssumptions: string;
  uncertaintyMethod: string;
}

export interface EnergyYieldResult {
  turbineModel: {
    id: string;
    manufacturer: string;
    model: string;
    ratedPowerKw: number;
    rotorDiameterM: number;
  };
  hubHeightM: number;
  turbineCount: number;
  grossAepMwh: number;
  grossTotalAepMwh: number;
  grossCapacityFactor: number;
  losses: LossStack;
  netAepMwh: number;
  netTotalAepMwh: number;
  netCapacityFactor: number;
  centralEstimate: SensitivityScenario;
  downside10: SensitivityScenario;
  downside20: SensitivityScenario;
  monthlyProductionMwh: number[];
  assumptions: AepAssumptions;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
}

export interface AepOptions {
  hubHeightM?: number;
  turbineCount?: number;
  elevationM?: number;
  windShearAlpha?: number;
  losses?: Partial<LossOverrides>;
  /** Wake model to use: 'jensen', 'bastankhah', or 'parametric' (flat %). Default: 'parametric'. */
  wakeModel?: 'jensen' | 'bastankhah' | 'parametric';
  /** Turbine layout positions. Required for directional wake modelling. */
  layoutPositions?: Array<{ lat: number; lng: number }>;
  /** Terrain roughness class (0-3) for wake decay constant derivation. */
  roughnessClass?: number;
}

export interface LossOverrides {
  wakeLossPct: number;
  electricalLossPct: number;
  availabilityLossPct: number;
  environmentalLossPct: number;
  icingLossPct: number;
  hysteresisLossPct: number;
  gridCurtailmentPct: number;
}
