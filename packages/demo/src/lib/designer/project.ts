import {
  DEFAULT_FINANCIAL_PARAMS,
  validateWindData,
  type ExclusionZone,
  type LatLng,
  type WindDataSummary,
  type SiteAnalysis,
} from '@jamieblair/windforge-core';
import { designerTurbine } from './turbines';
import { ring } from '../engineering/calculate';
import sample from './caithness.json';

export const MAX_TURBINES = 32;
export const MAX_LAYOUTS = 8;
export const EXAMPLE = { lat: 58.45, lng: -3.65 };
export const DRAFT_PREFIX = 'windforge.designer.v1:';
export const RECENT = 'windforge.designer.recent';
export const siteKey = (p: LatLng) => p.lat.toFixed(5) + ',' + p.lng.toFixed(5);
export const samePoint = (a: LatLng, b: LatLng) => siteKey(a) === siteKey(b);
export const rounded = (p: LatLng) => ({
  lat: Number(p.lat.toFixed(5)),
  lng: Number(p.lng.toFixed(5)),
});
export interface Evidence {
  coordinate: LatLng;
  at: string;
  score: number | null;
  detail: string;
  alerts: string[];
  blockers?: string[];
  wind: WindDataSummary | null;
  shear: number;
  source: string;
}
export function evidenceFrom(site: SiteAnalysis): Evidence {
  return {
    coordinate: site.coordinate,
    at: site.metadata.analysedAt,
    score: site.compositeScore,
    detail: site.metadata.completeness.detail,
    alerts: site.warnings.map((item) => item.description),
    blockers: site.hardConstraints.map((item) => item.description),
    wind: site.windResource?.resolved ?? null,
    shear: site.metadata.windShearAlpha,
    source: [
      site.windResource?.primarySource,
      site.windResource?.correction.status === 'applied'
        ? site.windResource.correction.reference?.toUpperCase()
        : null,
    ]
      .filter(Boolean)
      .join(' + '),
  };
}
export interface Layout {
  id: string;
  name: string;
  positions: LatLng[];
  turbineId: string;
  hub: number;
  capex: number;
  opex: number;
}
export interface ParcelEvidence {
  at: string;
  zones: ExclusionZone[];
  summary: string;
}
export function validScreen(s: ParcelEvidence) {
  const polygon = (r: LatLng[]) => Array.isArray(r) && r.length >= 3 && r.every(validPoint);
  return (
    s &&
    Number.isFinite(Date.parse(s.at)) &&
    typeof s.summary === 'string' &&
    Array.isArray(s.zones) &&
    s.zones.every(
      (z) =>
        z &&
        typeof z.reason === 'string' &&
        polygon(z.polygon) &&
        (z.holes === undefined || (Array.isArray(z.holes) && z.holes.every(polygon))),
    )
  );
}
export interface Project {
  screen?: ParcelEvidence;
  version: 1;
  site: LatLng;
  evidence: Evidence | null;
  boundary: LatLng[];
  receptor: LatLng | null;
  price: number;
  active: string;
  layouts: Layout[];
}
export function availableName(layouts: Layout[], suggestion: string) {
  const names = new Set(layouts.map((l) => l.name.toLowerCase()));
  let name = suggestion;
  for (let number = 2; names.has(name.toLowerCase()); number++) name = suggestion + ' ' + number;
  return name;
}
export function newLayout(name: string): Layout {
  return {
    id: Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
      n.toString(16).padStart(8, '0'),
    ).join(''),
    name,
    turbineId: 'vestas-v90-2000',
    hub: 95,
    positions: [],
    capex: DEFAULT_FINANCIAL_PARAMS.capexPerMw,
    opex: DEFAULT_FINANCIAL_PARAMS.opexPerMwPerYear,
  };
}
export function createProject(site: LatLng): Project {
  const example = samePoint(site, EXAMPLE);
  const offset = (north: number, east: number) =>
    rounded({ lat: site.lat + north, lng: site.lng + east });
  const first = newLayout(example ? 'West ridge' : 'Layout 1');
  const layouts = [first];
  if (example) {
    first.positions = [
      offset(-0.004, -0.013),
      offset(0, -0.005),
      offset(0.004, 0.003),
      offset(0.008, 0.011),
    ];
    layouts.push({
      ...newLayout('Staggered rows'),
      positions: [
        offset(-0.006, -0.013),
        offset(-0.006, 0.007),
        offset(0.006, -0.006),
        offset(0.006, 0.014),
      ],
    });
  }
  return {
    version: 1,
    site,
    evidence: example ? evidenceFrom(sample as SiteAnalysis) : null,
    boundary: [
      offset(-0.013, -0.023),
      offset(-0.013, 0.021),
      offset(0.01, 0.025),
      offset(0.015, 0.004),
      offset(0.012, -0.022),
    ],
    receptor: example ? offset(0.006, 0.02) : null,
    price: DEFAULT_FINANCIAL_PARAMS.energyPricePerMwh,
    active: first.id,
    layouts,
  };
}
const within = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
export function validPoint(x: unknown): x is LatLng {
  if (!x || typeof x !== 'object') return false;
  const p = x as LatLng;
  return within(p.lat, -85, 85) && within(p.lng, -180, 180);
}
export const validSite = (p: LatLng) => within(p.lat, -84, 84) && within(p.lng, -179.8, 179.8);
export function checkedBoundary(points: LatLng[], site: LatLng) {
  return ring(
    { type: 'Polygon', coordinates: [[...points, points[0]].map((p) => [p?.lng, p?.lat])] },
    site,
  );
}
export function validEvidence(e: Evidence, site: LatLng) {
  return (
    e &&
    validPoint(e.coordinate) &&
    samePoint(e.coordinate, site) &&
    Number.isFinite(Date.parse(e.at)) &&
    (e.score === null || within(e.score, 0, 100)) &&
    typeof e.detail === 'string' &&
    typeof e.source === 'string' &&
    (e.blockers === undefined ||
      (Array.isArray(e.blockers) && e.blockers.every((s) => typeof s === 'string'))) &&
    Array.isArray(e.alerts) &&
    e.alerts.every((a) => typeof a === 'string') &&
    within(e.shear, 0, 1) &&
    (e.wind === null ||
      (validPoint(e.wind.coordinate) &&
        samePoint(e.wind.coordinate, site) &&
        validateWindData(e.wind).valid))
  );
}
export function readProject(raw: string, site: LatLng): Project {
  const p = JSON.parse(raw) as Project;
  const validLayout = (l: Layout) =>
    l &&
    typeof l.id === 'string' &&
    typeof l.name === 'string' &&
    l.name.trim().length > 0 &&
    !!designerTurbine(l.turbineId)?.hubHeightOptionsM.includes(l.hub) &&
    Array.isArray(l.positions) &&
    l.positions.length <= MAX_TURBINES &&
    l.positions.every(validPoint) &&
    within(l.capex, 1, 50e6) &&
    within(l.opex, 0, 5e6);
  if (
    p?.version !== 1 ||
    !validPoint(p.site) ||
    !samePoint(p.site, site) ||
    !validSite(p.site) ||
    !Array.isArray(p.boundary) ||
    !p.boundary.every(validPoint) ||
    (p.screen !== undefined && !validScreen(p.screen)) ||
    !(p.receptor === null || validPoint(p.receptor)) ||
    !within(p.price, 0, 2000) ||
    !Array.isArray(p.layouts) ||
    !p.layouts.length ||
    p.layouts.length > MAX_LAYOUTS ||
    !p.layouts.every(validLayout) ||
    new Set(p.layouts.map((l) => l.id)).size !== p.layouts.length ||
    !p.layouts.some((l) => l.id === p.active) ||
    !(p.evidence === null || validEvidence(p.evidence, site))
  )
    throw new Error('Unrecognised design file.');
  checkedBoundary(p.boundary, site);
  return p;
}
