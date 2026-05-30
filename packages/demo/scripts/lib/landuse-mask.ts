/**
 * OSM land-use mask for the heatmap grid: classify each point as built-up,
 * farmland, or open, so the worker can skip housing/industrial land and focus
 * on developable ground (no turbines in central Glasgow).
 *
 * Fetches landuse polygons from Overpass tile-by-tile (cached to disk, rate
 * limited), buckets them spatially, and exposes a fast point classifier.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { isPointInPolygon, type LatLng } from '@jamieblair/windforge-core';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'WindForge-Heatmap/0.1 (+https://wind.jamieblair.co.uk)';
const TILE_DEG = 0.2;
const BUILT = /^(residential|industrial|commercial|retail|military|construction|garages|railway|landfill|quarry|brownfield)$/;
const FARM = /^(farmland|farmyard|meadow|orchard|vineyard|greenhouse_horticulture|grass|greenfield|allotments)$/;

export type LandClass = 'built' | 'farmland' | 'open';

interface Poly {
  cat: 'built' | 'farmland';
  ring: LatLng[];
  bbox: { s: number; w: number; n: number; e: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tileKey = (lat: number, lng: number) =>
  `${Math.floor(lat / TILE_DEG)},${Math.floor(lng / TILE_DEG)}`;

function ringBbox(ring: LatLng[]): Poly['bbox'] {
  let s = Infinity;
  let w = Infinity;
  let n = -Infinity;
  let e = -Infinity;
  for (const p of ring) {
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
    if (p.lng < w) w = p.lng;
    if (p.lng > e) e = p.lng;
  }
  return { s, w, n, e };
}

interface OverpassWay {
  type: string;
  tags?: { landuse?: string };
  geometry?: Array<{ lat: number; lon: number }>;
}

async function fetchTile(s: number, w: number, n: number, e: number): Promise<Poly[]> {
  const query = `[out:json][timeout:120];(way["landuse"](${s},${w},${n},${e}););out geom;`;
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(130_000),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const data = (await res.json()) as { elements?: OverpassWay[] };
  const polys: Poly[] = [];
  for (const el of data.elements ?? []) {
    const lu = el.tags?.landuse ?? '';
    const cat: Poly['cat'] | null = BUILT.test(lu) ? 'built' : FARM.test(lu) ? 'farmland' : null;
    if (!cat || !el.geometry || el.geometry.length < 3) continue;
    const ring = el.geometry.map((g) => ({ lat: g.lat, lng: g.lon }));
    polys.push({ cat, ring, bbox: ringBbox(ring) });
  }
  return polys;
}

export interface LanduseMask {
  classify: (p: LatLng) => LandClass;
  stats: { tiles: number; polys: number };
}

/**
 * Build a land-use classifier over the window. Tiles are cached under
 * `${cacheDir}/<key>.json`, so re-runs and resumes don't refetch.
 */
export async function buildLanduseMask(
  window: { south: number; north: number; west: number; east: number },
  opts: { cacheDir: string; delayMs?: number; onProgress?: (done: number, total: number) => void },
): Promise<LanduseMask> {
  const delayMs = opts.delayMs ?? 1500;
  mkdirSync(opts.cacheDir, { recursive: true });

  const builtByTile = new Map<string, Poly[]>();
  const farmByTile = new Map<string, Poly[]>();
  const bucket = (poly: Poly) => {
    const map = poly.cat === 'built' ? builtByTile : farmByTile;
    for (let lat = Math.floor(poly.bbox.s / TILE_DEG); lat <= Math.floor(poly.bbox.n / TILE_DEG); lat += 1) {
      for (let lng = Math.floor(poly.bbox.w / TILE_DEG); lng <= Math.floor(poly.bbox.e / TILE_DEG); lng += 1) {
        const key = `${lat},${lng}`;
        const arr = map.get(key) ?? [];
        arr.push(poly);
        map.set(key, arr);
      }
    }
  };

  // Enumerate tiles covering the window.
  const tiles: Array<[number, number]> = [];
  for (let lat = Math.floor(window.south / TILE_DEG); lat <= Math.floor(window.north / TILE_DEG); lat += 1) {
    for (let lng = Math.floor(window.west / TILE_DEG); lng <= Math.floor(window.east / TILE_DEG); lng += 1) {
      tiles.push([lat, lng]);
    }
  }

  let polyCount = 0;
  for (let i = 0; i < tiles.length; i += 1) {
    const [tlat, tlng] = tiles[i] as [number, number];
    const cacheFile = `${opts.cacheDir}/${tlat}_${tlng}.json`;
    let polys: Poly[];
    if (existsSync(cacheFile)) {
      polys = JSON.parse(readFileSync(cacheFile, 'utf8')) as Poly[];
    } else {
      await sleep(delayMs);
      try {
        polys = await fetchTile(tlat * TILE_DEG, tlng * TILE_DEG, (tlat + 1) * TILE_DEG, (tlng + 1) * TILE_DEG);
        // Cache only on success, so a transient Overpass failure isn't frozen in.
        writeFileSync(cacheFile, JSON.stringify(polys));
      } catch {
        polys = []; // tolerate a failed tile this run — those cells default to 'open'
      }
    }
    for (const p of polys) bucket(p);
    polyCount += polys.length;
    opts.onProgress?.(i + 1, tiles.length);
  }

  const classify = (p: LatLng): LandClass => {
    const key = tileKey(p.lat, p.lng);
    for (const poly of builtByTile.get(key) ?? []) {
      if (isPointInPolygon(p, poly.ring)) return 'built';
    }
    for (const poly of farmByTile.get(key) ?? []) {
      if (isPointInPolygon(p, poly.ring)) return 'farmland';
    }
    return 'open';
  };

  return { classify, stats: { tiles: tiles.length, polys: polyCount } };
}
