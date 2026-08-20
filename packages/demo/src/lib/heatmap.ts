/**
 * Shared types and helpers for the UK suitability heatmap. Imported by both the
 * batch worker (scripts/generate-heatmap.ts) and the /map page.
 */

export interface HeatmapCell {
  lat: number;
  lng: number;
  /** Composite suitability score 0-100, or null if the point errored. */
  score: number | null;
  confidence?: 'high' | 'medium' | 'low';
  windSpeedMs?: number | null;
  windScore?: number | null;
  hardConstraints?: number;
  /** OSM land-use class for the cell: 'farmland' | 'open' | 'built' | etc. */
  landuse?: string | null;
  /** Net capacity factor (0-1) for the reference turbine. */
  capacityFactor?: number | null;
  /** Levelised cost of energy (£/MWh) for the reference turbine. */
  lcoePerMwh?: number | null;
  /** True when LCOE is at/below the reference market price (no subsidy needed). */
  subsidyFree?: boolean;
  /** True for sea points (offshore) vs UK land (onshore). */
  offshore?: boolean;
  error?: string;
}

export type HeatmapMetric = 'suitability' | 'wind' | 'economics';

export interface HeatmapBBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface HeatmapMeta {
  bbox: HeatmapBBox;
  spacingKm: number;
  /** Cell size in degrees, for drawing rectangles. */
  latStepDeg: number;
  lngStepDeg: number;
  hubHeightM: number;
  /** Planned point count (land cells in the grid). */
  total: number;
  /** Completed cells (successes + errors). */
  done: number;
  failed: number;
  complete: boolean;
  updatedAt: string;
  source?: string;
}

export interface HeatmapData {
  meta: HeatmapMeta;
  cells: HeatmapCell[];
}

interface ColorStop {
  at: number;
  rgb: [number, number, number];
}

// Sequential suitability ramp: deep red (poor) → amber → teal → bright green
// (excellent). Tuned to read clearly on the near-black surface.
const SCALE: ColorStop[] = [
  { at: 0, rgb: [74, 29, 46] },
  { at: 25, rgb: [138, 59, 47] },
  { at: 45, rgb: [185, 137, 58] },
  { at: 62, rgb: [74, 122, 184] },
  { at: 80, rgb: [107, 169, 255] },
  { at: 100, rgb: [124, 242, 201] },
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Map a 0-100 score to a hex colour along the suitability ramp. */
export function scoreColor(score: number): string {
  const s = clamp(score, 0, 100);
  let lo = SCALE[0] as ColorStop;
  let hi = SCALE[SCALE.length - 1] as ColorStop;
  for (let i = 0; i < SCALE.length - 1; i += 1) {
    const a = SCALE[i] as ColorStop;
    const b = SCALE[i + 1] as ColorStop;
    if (s >= a.at && s <= b.at) {
      lo = a;
      hi = b;
      break;
    }
  }
  const span = hi.at - lo.at || 1;
  const t = clamp((s - lo.at) / span, 0, 1);
  const r = Math.round(lerp(lo.rgb[0], hi.rgb[0], t));
  const g = Math.round(lerp(lo.rgb[1], hi.rgb[1], t));
  const b = Math.round(lerp(lo.rgb[2], hi.rgb[2], t));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Build a colour function that stretches the palette across the *actual* spread
 * of the data (5th–95th percentile), so tightly-clustered scores still show
 * contrast instead of all reading as one shade. `invert` for metrics where lower
 * is better (e.g. LCOE). Returns the domain used, for the legend.
 */
export function makeRelativeColor(
  values: number[],
  opts?: { invert?: boolean },
): { color: (v: number) => string; lo: number; hi: number } {
  const invert = opts?.invert ?? false;
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) {
    return { color: () => scoreColor(50), lo: 0, hi: 1 };
  }
  const q = (p: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.round(p * (xs.length - 1))))] as number;
  let lo = q(0.05);
  let hi = q(0.95);
  if (hi <= lo) {
    lo = xs[0] as number;
    hi = xs[xs.length - 1] as number;
  }
  if (hi <= lo) hi = lo + 1;
  const color = (v: number) => {
    let t = (v - lo) / (hi - lo);
    t = Math.max(0, Math.min(1, t));
    if (invert) t = 1 - t;
    return scoreColor(t * 100);
  };
  return { color, lo, hi };
}

/** Degree cell size for a spacing in km at a given latitude (for drawing). */
export function cellStepDeg(spacingKm: number, atLat: number): { latStepDeg: number; lngStepDeg: number } {
  const latStepDeg = spacingKm / 111.32;
  const lngStepDeg = spacingKm / (111.32 * Math.cos((atLat * Math.PI) / 180));
  return { latStepDeg, lngStepDeg };
}

/** Pull the highest (hub-height) wind speed out of the wind factor detail text. */
export function parseWindSpeedMs(detail: string | undefined): number | null {
  if (!detail) return null;
  const matches = [...detail.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*m\/s/g)];
  const speeds = matches.map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
  return speeds.length > 0 ? Math.max(...speeds) : null;
}
