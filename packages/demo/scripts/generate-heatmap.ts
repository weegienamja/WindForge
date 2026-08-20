/**
 * UK wind-site suitability heatmap worker.
 *
 * Runs the full six-factor `analyseSite` over a land-masked grid of the UK,
 * politely (low concurrency + global rate gate + resume), and serves the
 * growing result as JSON over HTTP so the /map page can fill in live.
 *
 * Run on a small always-on box (e.g. Hetzner):
 *   pnpm --filter @jamieblair/windforge-core build
 *   pnpm --filter @jamieblair/windforge-demo heatmap
 *
 * Datapoints are written to a SQLite database (built-in node:sqlite) so runs
 * resume and scale to millions of points; a capped JSON snapshot is also served
 * for the live /map feed.
 *
 * Env / flags (all optional):
 *   SPACING_KM=25        grid spacing in km (e.g. 0.064 ≈ 1 acre; goes super slow)
 *   BBOX=s,w,n,e         restrict to an area of interest (default: whole UK)
 *   CONCURRENCY=2        parallel analyses (keep low — Overpass is strict)
 *   DELAY_MS=700         min ms between analysis starts (global rate gate)
 *   HUB_M=100            hub height
 *   PORT=8088            HTTP port for the live feed (/heatmap.json)
 *   DB=./heatmap-data/uk.db      SQLite datapoint store (resume source)
 *   OUT=./heatmap-data/uk.json   capped JSON snapshot for the live feed
 *   MAX_FEED=15000       cap cells in the snapshot/feed (DB keeps everything)
 *   LIMIT=0              cap number of points (0 = no cap; handy for testing)
 *   --landuse            skip built-up land (housing/industrial) via OSM landuse
 *   --farmland-only      keep only farmland/open land (implies --landuse)
 *   --dry-run            print the plan (point count) and exit, no API calls
 *   --onshore-only       UK land only (skip the offshore buffer)
 *   --no-mask            skip the UK land mask (grid the whole bbox)
 */

import { createServer } from 'node:http';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import pLimit from 'p-limit';
import {
  analyseSite,
  calculateAep,
  calculateLcoe,
  DEFAULT_FINANCIAL_PARAMS,
  fetchWindData,
  getAllTurbines,
  isPointInPolygon,
  pointToPolygonEdgeDistanceM,
  ScoringFactor,
  type FactorScore,
  type LatLng,
  type TurbineModel,
} from '@jamieblair/windforge-core';
import {
  cellStepDeg,
  parseWindSpeedMs,
  type HeatmapCell,
  type HeatmapData,
  type HeatmapMeta,
} from '../src/lib/heatmap';
import { HeatmapStore } from './lib/heatmap-store';
import { buildLanduseMask, type LandClass } from './lib/landuse-mask';

// ─── Config ──────────────────────────────────────────────────────────────

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const SPACING_KM = num('SPACING_KM', 25);
const CONCURRENCY = num('CONCURRENCY', 2);
const DELAY_MS = num('DELAY_MS', 700);
const HUB_M = num('HUB_M', 100);
const PORT = num('PORT', 8088);
const LIMIT = Number(process.env.LIMIT ?? 0) || 0;
const OUT = process.env.OUT ?? './heatmap-data/uk.json';
const DB_PATH = process.env.DB ?? './heatmap-data/uk.db';
const MAX_FEED = num('MAX_FEED', 15000);
// How far offshore (km from the UK coastline) to include sea points. UK offshore
// wind sits mostly within ~60 km; raise toward ~150 to reach Dogger Bank.
const OFFSHORE_KM = num('OFFSHORE_KM', 60);
const DRY_RUN = flags.has('--dry-run');
const USE_MASK = !flags.has('--no-mask');
const ONSHORE_ONLY = flags.has('--onshore-only');
const FARMLAND_ONLY = flags.has('--farmland-only');
const USE_LANDUSE = FARMLAND_ONLY || flags.has('--landuse');

// Default window covers Great Britain, NI and surrounding UK waters; BBOX env
// (south,west,north,east) restricts to an area of interest for fine runs.
const UK_WINDOW = { south: 49.3, north: 61.3, west: -9.5, east: 3.6 };
function parseBbox(): typeof UK_WINDOW {
  const raw = process.env.BBOX;
  if (!raw) return UK_WINDOW;
  const [s, w, n, e] = raw.split(',').map(Number);
  if ([s, w, n, e].some((v) => !Number.isFinite(v))) return UK_WINDOW;
  return { south: s as number, west: w as number, north: n as number, east: e as number };
}
const WINDOW = parseBbox();
// Neighbouring coasts to exclude so their land isn't mistaken for UK sea.
const NEIGHBOURS = ['Ireland', 'France', 'Belgium', 'Netherlands'];
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'WindForge-Heatmap/0.1 (+https://wind.jamieblair.co.uk)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// 5 decimals ≈ 1.1 m, fine enough to keep sub-100 m (e.g. 1-acre) cells distinct.
const cellId = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

// Reference turbine (~2 MW) and market price used for the per-cell economics so
// every point is compared on the same basis.
const REF_TURBINE: TurbineModel | undefined =
  getAllTurbines().find((t) => Math.abs(t.ratedPowerKw - 2000) < 250) ?? getAllTurbines()[0];
const REF_PRICE = DEFAULT_FINANCIAL_PARAMS.energyPricePerMwh;

async function computeEconomics(
  p: LatLng,
): Promise<{ capacityFactor: number | null; lcoePerMwh: number | null; subsidyFree: boolean }> {
  if (!REF_TURBINE) return { capacityFactor: null, lcoePerMwh: null, subsidyFree: false };
  // Wind data was already fetched by analyseSite for this coordinate, so this
  // is a cache hit.
  const wind = await fetchWindData(p);
  if (!wind.ok) return { capacityFactor: null, lcoePerMwh: null, subsidyFree: false };
  const aep = calculateAep(wind.value, REF_TURBINE, { hubHeightM: HUB_M });
  if (!aep.ok) return { capacityFactor: null, lcoePerMwh: null, subsidyFree: false };
  const lcoe = Math.round(calculateLcoe(aep.value).lcoePerMwh);
  return {
    capacityFactor: Number(aep.value.netCapacityFactor.toFixed(3)),
    lcoePerMwh: lcoe,
    subsidyFree: lcoe <= REF_PRICE,
  };
}

function overallConfidence(factors: ReadonlyArray<FactorScore>): 'high' | 'medium' | 'low' {
  if (factors.length === 0) return 'low';
  const w = { high: 3, medium: 2, low: 1 } as const;
  const avg = factors.reduce((acc, f) => acc + w[f.confidence], 0) / factors.length;
  return avg >= 2.5 ? 'high' : avg >= 1.5 ? 'medium' : 'low';
}

// ─── Land mask (UK boundary via Nominatim, with bbox fallback) ─────────────

async function fetchCountryRings(country: string): Promise<LatLng[][]> {
  const url = `${NOMINATIM}/search?country=${encodeURIComponent(country)}&format=jsonv2&polygon_geojson=1&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim ${res.status} for ${country}`);
  const data = (await res.json()) as Array<{ geojson?: { type: string; coordinates: unknown } }>;
  const geo = data[0]?.geojson;
  if (!geo) throw new Error(`No geojson for ${country}`);
  const rings: LatLng[][] = [];
  const toRing = (coords: number[][]) => coords.map(([lng, lat]) => ({ lat: lat as number, lng: lng as number }));
  if (geo.type === 'Polygon') {
    rings.push(toRing((geo.coordinates as number[][][])[0] ?? []));
  } else if (geo.type === 'MultiPolygon') {
    for (const poly of geo.coordinates as number[][][][]) {
      if (poly[0]) rings.push(toRing(poly[0]));
    }
  }
  return rings.filter((r) => r.length >= 3);
}

const inAnyRing = (p: LatLng, rings: LatLng[][]) => rings.some((r) => isPointInPolygon(p, r));

/**
 * Classify a grid point relative to the UK. Returns null to skip (foreign land
 * or open ocean beyond the offshore buffer), otherwise whether it is offshore.
 */
function makeClassifier(uk: LatLng[][], neighbours: LatLng[][]) {
  const offshoreM = OFFSHORE_KM * 1000;
  return (p: LatLng): { offshore: boolean } | null => {
    if (inAnyRing(p, uk)) return { offshore: false };
    if (ONSHORE_ONLY) return null;
    if (inAnyRing(p, neighbours)) return null; // Irish/French/etc. land
    // Sea point: include only if close enough to the UK coastline.
    let nearest = Infinity;
    for (const ring of uk) {
      const d = pointToPolygonEdgeDistanceM(p, ring);
      if (d < nearest) nearest = d;
      if (nearest <= offshoreM) break;
    }
    return nearest <= offshoreM ? { offshore: true } : null;
  };
}

// ─── Grid ──────────────────────────────────────────────────────────────────

interface GridPoint extends LatLng {
  offshore: boolean;
  landuse?: LandClass;
}

function buildGrid(
  classify: (p: LatLng) => { offshore: boolean } | null,
  landClassify: ((p: LatLng) => LandClass) | null,
): { points: GridPoint[]; latStepDeg: number; lngStepDeg: number; builtSkipped: number } {
  const midLat = (WINDOW.north + WINDOW.south) / 2;
  const { latStepDeg, lngStepDeg } = cellStepDeg(SPACING_KM, midLat);
  // Sub-100 m grids need more decimals than 4 to stay distinct.
  const round = (v: number) => Number(v.toFixed(latStepDeg < 0.01 ? 6 : 4));
  const points: GridPoint[] = [];
  let builtSkipped = 0;
  for (let lat = WINDOW.south + latStepDeg / 2; lat < WINDOW.north; lat += latStepDeg) {
    for (let lng = WINDOW.west + lngStepDeg / 2; lng < WINDOW.east; lng += lngStepDeg) {
      const p = { lat: round(lat), lng: round(lng) };
      const cls = classify(p);
      if (!cls) continue;
      let landuse: LandClass | undefined;
      if (landClassify && !cls.offshore) {
        landuse = landClassify(p);
        if (landuse === 'built') {
          builtSkipped += 1;
          continue; // never site a turbine in housing/industrial land
        }
        if (FARMLAND_ONLY && landuse !== 'farmland') continue;
      }
      points.push({ ...p, offshore: cls.offshore, landuse });
    }
  }
  return { points, latStepDeg, lngStepDeg, builtSkipped };
}

// ─── State + persistence (SQLite + capped JSON snapshot) ───────────────────

const store = new HeatmapStore(DB_PATH);
let meta: HeatmapMeta;
let doneCount = 0;

function snapshot(): HeatmapData {
  // Capped, decimated sample for the browser; the DB holds everything.
  const cells = store.sample(MAX_FEED);
  return {
    meta: {
      ...meta,
      done: doneCount,
      failed: 0,
      complete: doneCount >= meta.total,
      updatedAt: new Date().toISOString(),
    },
    cells,
  };
}

let saveScheduled = false;
function saveSoon(): void {
  if (saveScheduled) return;
  saveScheduled = true;
  setTimeout(async () => {
    saveScheduled = false;
    try {
      await mkdir(dirname(OUT), { recursive: true });
      const tmp = `${OUT}.tmp`;
      await writeFile(tmp, JSON.stringify(snapshot()));
      await rename(tmp, OUT);
    } catch (err) {
      console.error('[save] failed', err);
    }
  }, 2000);
}

// ─── Rate-limited analysis ─────────────────────────────────────────────────

let lastStart = 0;
async function rateGate(): Promise<void> {
  const wait = lastStart + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastStart = Date.now();
}

async function analysePoint(p: GridPoint): Promise<HeatmapCell> {
  await rateGate();
  try {
    const result = await analyseSite({ coordinate: { lat: p.lat, lng: p.lng }, hubHeightM: HUB_M });
    if (!result.ok) {
      return { lat: p.lat, lng: p.lng, offshore: p.offshore, landuse: p.landuse, score: null, error: result.error.code };
    }
    const a = result.value;
    const wind = a.factors.find((f) => f.factor === ScoringFactor.WindResource);
    const econ = await computeEconomics({ lat: p.lat, lng: p.lng });
    return {
      lat: p.lat,
      lng: p.lng,
      offshore: p.offshore,
      landuse: p.landuse,
      score: Math.round(a.compositeScore),
      confidence: overallConfidence(a.factors),
      windScore: wind ? Math.round(wind.score) : null,
      windSpeedMs: parseWindSpeedMs(wind?.detail),
      hardConstraints: a.hardConstraints.length,
      capacityFactor: econ.capacityFactor,
      lcoePerMwh: econ.lcoePerMwh,
      subsidyFree: econ.subsidyFree,
    };
  } catch (err) {
    return { lat: p.lat, lng: p.lng, offshore: p.offshore, landuse: p.landuse, score: null, error: err instanceof Error ? err.message : 'failed' };
  }
}

// ─── HTTP feed ───────────────────────────────────────────────────────────

function startServer(): void {
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(snapshot()));
  });
  server.listen(PORT, () => console.log(`[serve] live feed on http://0.0.0.0:${PORT}/heatmap.json`));
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let classify: (p: LatLng) => { offshore: boolean } | null = () => ({ offshore: false });
  if (USE_MASK) {
    try {
      console.log('[mask] fetching UK boundary from Nominatim…');
      const uk = await fetchCountryRings('United Kingdom');
      console.log(`[mask] UK: ${uk.length} rings`);
      const neighbours: LatLng[][] = [];
      if (!ONSHORE_ONLY) {
        for (const name of NEIGHBOURS) {
          await sleep(1100); // Nominatim courtesy rate limit
          try {
            const rings = await fetchCountryRings(name);
            neighbours.push(...rings);
            console.log(`[mask] ${name}: ${rings.length} rings (exclude)`);
          } catch (err) {
            console.warn(`[mask] ${name} failed:`, err instanceof Error ? err.message : err);
          }
        }
      }
      classify = makeClassifier(uk, neighbours);
    } catch (err) {
      console.warn('[mask] failed, gridding the whole window:', err instanceof Error ? err.message : err);
    }
  }

  // Optional OSM land-use mask: skip built-up land (housing/industrial).
  let landClassify: ((p: LatLng) => LandClass) | null = null;
  if (USE_LANDUSE) {
    console.log(`[landuse] fetching OSM land use over the window (tiled)…`);
    const mask = await buildLanduseMask(WINDOW, {
      cacheDir: './heatmap-data/landuse',
      onProgress: (d, t) => {
        if (d % 10 === 0 || d === t) console.log(`[landuse] tile ${d}/${t}`);
      },
    });
    landClassify = mask.classify;
    console.log(`[landuse] ${mask.stats.polys} polygons across ${mask.stats.tiles} tiles`);
  }

  const { points: allPoints, latStepDeg, lngStepDeg, builtSkipped } = buildGrid(classify, landClassify);
  const points = LIMIT > 0 ? allPoints.slice(0, LIMIT) : allPoints;
  const offshoreCount = points.filter((p) => p.offshore).length;

  meta = {
    bbox: WINDOW,
    spacingKm: SPACING_KM,
    latStepDeg,
    lngStepDeg,
    hubHeightM: HUB_M,
    total: points.length,
    done: 0,
    failed: 0,
    complete: false,
    updatedAt: new Date().toISOString(),
    source: `analyseSite (six-factor composite)${USE_LANDUSE ? ', built-up excluded' : ''}`,
  };

  console.log(
    `[plan] ${points.length} points (${points.length - offshoreCount} onshore + ${offshoreCount} offshore${ONSHORE_ONLY ? '' : ` ≤${OFFSHORE_KM}km`})${USE_LANDUSE ? ` · ${builtSkipped} built-up skipped` : ''} · spacing ${SPACING_KM}km · concurrency ${CONCURRENCY} · delay ${DELAY_MS}ms`,
  );
  const estHours = ((points.length * DELAY_MS) / 3_600_000).toFixed(1);
  console.log(`[plan] rough lower bound ≈ ${estHours} h (network will add more)`);
  if (DRY_RUN) return;

  const migrated = store.migrateFromJson(OUT, cellId);
  if (migrated > 0) console.log(`[migrate] imported ${migrated} cells from ${OUT} into ${DB_PATH}`);
  console.log(`[store] ${DB_PATH} holds ${store.count()} cells`);
  startServer();

  const todo = points.filter((p) => !store.has(cellId(p.lat, p.lng)));
  doneCount = points.length - todo.length;
  console.log(`[run] ${todo.length} remaining (${doneCount} already done)`);

  const limit = pLimit(CONCURRENCY);
  await Promise.all(
    todo.map((p) =>
      limit(async () => {
        const cell = await analysePoint(p);
        store.upsert(cellId(p.lat, p.lng), cell);
        doneCount += 1;
        if (doneCount % 25 === 0 || doneCount === points.length) {
          console.log(`[run] ${doneCount}/${points.length}  (${Math.round((doneCount / points.length) * 100)}%)`);
        }
        saveSoon();
      }),
    ),
  );

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(snapshot()));
  console.log(`[done] ${store.count()} cells in ${DB_PATH}; snapshot in ${OUT}`);
  console.log('[done] HTTP feed still serving; Ctrl-C to stop.');
}

process.on('SIGINT', async () => {
  console.log('\n[exit] saving snapshot…');
  try {
    await writeFile(OUT, JSON.stringify(snapshot()));
    store.close();
  } catch {
    // best effort
  }
  process.exit(0);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
