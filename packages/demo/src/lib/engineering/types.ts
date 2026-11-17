import type {
  EnergyYieldResult,
  LatLng,
  SiteAnalysis,
  ExclusionZone,
} from '@jamieblair/windforge-core';
export interface Source {
  id: string;
  title: string;
  url: string;
  revision: string;
  sha256: string;
  terms: string;
  scope: string;
  license: string;
}
export interface Fact {
  line?: number;
  field: string;
  value: string | number | number[];
  unit: string;
  path: string;
}
export interface Part {
  machinery?: {
    basis: string;
    how: EngineeringNote;
    cases: MachineryCase[];
  };
  line?: number;
  function?: string;
  id: string;
  parent: string | null;
  label: string;
  path: string;
  facts: Fact[];
  description: string;
  source: string;
}
export interface EngineeringNote {
  source: string;
  text: string;
}
export interface MachineryCase {
  title: string;
  finding: EngineeringNote;
  inspect: EngineeringNote;
  scope: string;
}
export interface Model {
  id: string;
  name: string;
  kind: string;
  setting: string;
  revision: string;
  schema: string;
  definition: string;
  performance: string;
  curveLocator: string;
  ratedKw: number;
  rotorM: number;
  hubM: number;
  drive: string;
  cutIn: number;
  cutOut: number;
  curve: [number, number, number | null][];
  fullCurve: boolean;
  nodes: Part[];
}
export interface Catalogue {
  bundled?: boolean;
  release: string;
  models: Model[];
  sources: Record<string, Source>;
}
export interface Passage {
  id: string;
  locator: string;
  text: string;
  source: Source;
  similarity: number;
  keyword: boolean;
}
export interface Config {
  soundDba?: number | null;
  soundSource?: string;
  model: string;
  count: number;
  hub: number;
  wake: number;
  sector: 'whole' | 'west' | 'east';
  capex: number | null;
  opex: number | null;
}
export interface Geometry {
  ring: LatLng[];
  zones: ExclusionZone[] | null;
  source: string;
  retrieved: string;
  stamp: string | null;
}
export interface Case {
  model: string;
  label: string;
  config: Config;
  capacityMw: number;
  energy: EnergyYieldResult | null;
  positions: LatLng[];
  layoutCount: number | null;
  shadowHours: number | null;
  noiseDba?: number | null;
  lcoe: number | null;
  finance: Record<string, unknown> | null;
  gaps: string[];
  basis: string[];
}
export interface Report {
  engine: string;
  release: string;
  created: string;
  site: SiteAnalysis;
  siteId: string;
  geometry: Geometry | null;
  receptor: LatLng | null;
  setting: string;
  cases: Case[];
  sources: Source[];
  models: Model[];
  deltaMwh: number | null;
}
export interface Answer {
  type:
    | 'Documented fact'
    | 'Calculated result'
    | 'Research evidence'
    | 'Interpretation'
    | 'Unresolved';
  text: string;
  citations: { title: string; url: string; locator: string; text?: string }[];
  gaps: string[];
  record?: string;
  reportId?: string;
}
export interface Saved {
  id: string;
  kind: 'site' | 'comparison' | 'record';
  title: string;
  created: string;
}
