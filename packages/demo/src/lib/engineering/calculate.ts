import {
  calculateNoiseAtReceptor,
  calculateAep,
  calculateLcoe,
  calculateShadowFlicker,
  createBoundary,
  estimateTurbineCapacity,
  DEFAULT_FINANCIAL_PARAMS,
  ScoringFactor,
  type SiteAnalysis,
  type LatLng,
} from '@jamieblair/windforge-core';
import type { Config, Geometry, Model, Case } from './types';
export class InputError extends Error {}
export const fail = (s: string): never => {
  throw new InputError(s);
};
export function object(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x)) fail('Expected an object.');
  return x as Record<string, unknown>;
}
export function num(v: unknown, min: number, max: number, label: string) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
    fail('Invalid ' + label + '.');
  return v as number;
}
export function point(v: unknown): LatLng {
  const x = object(v);
  return { lat: num(x.lat, -89.5, 89.5, 'latitude'), lng: num(x.lng, -180, 180, 'longitude') };
}
export function options(v: unknown, models: Model[]): Config {
  const o = object(v),
    m = models.find((i) => i.id === o.model);
  if (!m) throw new InputError('Unknown reference turbine.');
  const count = num(o.count, 1, 32, 'turbine count');
  if (!Number.isInteger(count)) fail('Use a whole turbine count.');
  if (!['west', 'east', 'whole'].includes(String(o.sector))) fail('Unknown boundary partition.');
  return {
    model: m.id,
    count,
    hub: num(o.hub, m.rotorM / 2 + 1, 300, 'hub height or blade clearance'),
    wake: num(o.wake, 0, 50, 'wake loss'),
    sector: o.sector as Config['sector'],
    soundDba: o.soundDba == null ? null : num(o.soundDba, 1, 160, 'declared sound power'),
    soundSource:
      o.soundDba == null
        ? ''
        : typeof o.soundSource === 'string' &&
            o.soundSource.trim().length >= 4 &&
            o.soundSource.length <= 300
          ? o.soundSource.trim()
          : fail('Identify the acoustic source, turbine and operating condition.'),
    capex: o.capex == null ? null : num(o.capex, 1, 50e6, 'capital cost'),
    opex: o.opex == null ? null : num(o.opex, 1, 5e6, 'operating cost'),
  };
}
export function ring(v: unknown, site: LatLng): LatLng[] {
  let g = object(v);
  if (g.type === 'Feature') g = object(g.geometry);
  if (g.type !== 'Polygon' || !Array.isArray(g.coordinates) || g.coordinates.length !== 1)
    fail(
      'Use one GeoJSON Polygon without holes. Multi-part geometry and holes cannot be discarded.',
    );
  const raw = (g.coordinates as unknown[])[0];
  if (!Array.isArray(raw) || raw.length < 4 || raw.length > 65)
    throw new InputError('Use a closed ring with 3–64 vertices.');
  const p = raw.map((v) => {
    if (!Array.isArray(v) || v.length !== 2)
      throw new InputError('Use longitude, latitude coordinate pairs.');
    const q = point({ lng: v[0], lat: v[1] });
    if (Math.abs(q.lng - site.lng) > 0.12 || Math.abs(q.lat - site.lat) > 0.12)
      fail('Boundary must be within 0.12 degrees of the site point.');
    return q;
  });
  const last = p.pop()!;
  if (
    last.lat !== p[0]!.lat ||
    last.lng !== p[0]!.lng ||
    new Set(p.map((q) => q.lat + ',' + q.lng)).size !== p.length
  )
    fail('Close the ring and remove repeated vertices.');
  const cross = (a: LatLng, b: LatLng, c: LatLng) =>
    (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
  for (let i = 0; i < p.length; i++)
    for (let j = i + 2; j < p.length; j++) {
      if (i === 0 && j === p.length - 1) continue;
      const a = p[i]!,
        b = p[(i + 1) % p.length]!,
        c = p[j]!,
        d = p[(j + 1) % p.length]!;
      if (
        Math.max(a.lng, b.lng) < Math.min(c.lng, d.lng) ||
        Math.max(c.lng, d.lng) < Math.min(a.lng, b.lng) ||
        Math.max(a.lat, b.lat) < Math.min(c.lat, d.lat) ||
        Math.max(c.lat, d.lat) < Math.min(a.lat, b.lat)
      )
        continue;
      if (cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0)
        fail('Boundary intersects itself.');
    }
  const area = createBoundary(p).areaSqKm;
  if (area < 0.001 || area > 200) fail('Boundary must cover 0.001–200 km².');
  return p;
}
export function referenceTurbine(
  m: Pick<Model, 'id' | 'name' | 'ratedKw' | 'rotorM' | 'hubM' | 'curve'>,
) {
  return {
    id: m.id,
    manufacturer: 'IEA reference design',
    model: m.name,
    ratedPowerKw: m.ratedKw,
    rotorDiameterM: m.rotorM,
    hubHeightOptionsM: [m.hubM],
    powerCurve: m.curve.map((p) => ({ windSpeedMs: p[0], powerKw: p[1] })),
    thrustCurve: m.curve.flatMap((p) =>
      p[2] === null ? [] : [{ windSpeedMs: p[0], thrustCoefficient: p[2] }],
    ),
  };
}
export function calculate(
  site: SiteAnalysis,
  m: Model,
  c: Config,
  g: Geometry | null,
  receptor: LatLng | null,
  setting: string,
): Case {
  const t = referenceTurbine(m);
  const out: Case = {
    model: m.id,
    label: m.name,
    config: c,
    capacityMw: (m.ratedKw * c.count) / 1000,
    energy: null,
    positions: [],
    layoutCount: null,
    shadowHours: null,
    lcoe: null,
    finance: null,
    gaps: [],
    basis: [m.curveLocator],
  };
  const gap = (s: string) => out.gaps.push(s);
  const w = site.windResource?.resolved;
  if (setting !== m.setting)
    gap(
      setting === 'unknown'
        ? 'Site setting unconfirmed; design basis is ' + m.setting + '.'
        : 'Design basis is ' + m.setting + '; the selected site setting differs.',
    );
  if (c.hub !== m.hubM)
    gap('Alternative hub height is a sensitivity; structural suitability has not been checked.');
  if (c.soundDba == null) gap('No model-specific acoustic source levels: receptor noise withheld.');
  else if (!g || !receptor) gap('Acoustic propagation requires placed turbines and a receptor.');
  const access = site.factors.find((f) => f.factor === ScoringFactor.AccessLogistics);
  if (access) out.basis.push('Access screen: ' + access.detail);
  gap('Road proximity cannot establish blade transport clearance, port capacity or crane access.');
  if (site.compositeScore === null)
    gap('Site composite withheld: ' + site.metadata.completeness.detail);
  if (!g)
    gap(
      'No parcel supplied; count is hypothetical. Spacing, setbacks and receptor flicker are untested.',
    );
  if (!w) {
    gap('No resolved wind resource: energy, directional placement and financial outputs withheld.');
    return out;
  }
  if (g) {
    if (!g.zones) {
      gap('Boundary constraints unavailable; placement and associated yield withheld.');
      return out;
    }
    const b = createBoundary(g.ring),
      l = estimateTurbineCapacity(b, t, w, g.zones);
    const mid = (b.boundingBox.east + b.boundingBox.west) / 2;
    const positions = l.positions.filter(
      (p) => c.sector === 'whole' || (c.sector === 'west' ? p.lng < mid : p.lng >= mid),
    );
    out.layoutCount = positions.length;
    out.basis.push(
      '4D crosswind × 7D downwind grid; OSM exclusion polygons; ' +
        c.sector +
        ' grid centres. Direction ' +
        l.prevailingWindDeg.toFixed(1) +
        '°. No optimality claim.',
    );
    if (positions.length < c.count) {
      gap(
        'Requested count exceeds the retained grid positions. No yield reported for this layout.',
      );
      return out;
    }
    out.positions = positions.slice(0, c.count);
    if (receptor && c.soundDba != null && c.soundSource) {
      out.noiseDba = calculateNoiseAtReceptor(
        out.positions.map((location, id) => ({ id, location })),
        receptor,
        c.soundDba,
        c.hub,
      ).predictedLevelDba;
      out.basis.push(
        'Broadband screening using user-declared source sound power: ' +
          c.soundSource +
          '. Mixed ground, no terrain shielding or compliance determination.',
      );
    }
    if (receptor)
      out.basis.push(
        'Astronomical flicker uses hourly samples for 2025 and a 2 m receptor. A zero at hourly resolution does not exclude shorter events.',
      );
    if (receptor)
      out.shadowHours =
        calculateShadowFlicker(
          out.positions.map((location, id) => ({
            location,
            id,
            hubHeightM: c.hub,
            rotorDiameterM: m.rotorM,
          })),
          [receptor],
          { year: 2025, receptorHeightM: 2 },
        ).receptors[0]?.hoursPerYear ?? null;
    else gap('No receptor coordinate; astronomical shadow flicker withheld.');
  }
  if (!m.fullCurve) {
    gap('Published power table does not cover the full operating range.');
    return out;
  }
  const directional = out.positions.length > 0 && t.thrustCurve.length === m.curve.length;
  const a = calculateAep(w, t, {
    hubHeightM: c.hub,
    turbineCount: c.count,
    windShearAlpha: site.metadata.windShearAlpha,
    elevationM: 0,
    wakeModel: directional ? 'jensen' : 'parametric',
    layoutPositions: directional ? out.positions : undefined,
    losses: { wakeLossPct: c.count === 1 ? 0 : c.wake },
  });
  if (!a.ok) {
    gap(a.error.message);
    return out;
  }
  out.energy = a.value;
  out.basis.push(
    directional
      ? 'Jensen wakes with source Ct and placed turbines.'
      : 'User-set parametric wake sensitivity; no directional wake prediction.',
    'Standard sea-level air density assumed. Hub wind uses the site shear assumption. Electrical power from idealised reference simulations, not a measured power curve.',
  );
  if (c.capex !== null && c.opex !== null) {
    const params = { ...DEFAULT_FINANCIAL_PARAMS, capexPerMw: c.capex, opexPerMwPerYear: c.opex };
    out.finance = params;
    out.lcoe = calculateLcoe(a.value, params).lcoePerMwh;
  } else gap('Enter both capital and annual operating costs to calculate screening LCOE.');
  return out;
}
