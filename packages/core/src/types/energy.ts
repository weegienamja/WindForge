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

export interface PScenario {
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
  p50: PScenario;
  p75: PScenario;
  p90: PScenario;
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
