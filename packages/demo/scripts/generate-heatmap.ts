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
 * Env / flags (all optional):
 *   SPACING_KM=25        grid spacing in km (default 25 ≈ NASA POWER native res)
 *   CONCURRENCY=2        parallel analyses (keep low — Overpass is strict)
 *   DELAY_MS=700         min ms between analysis starts (global rate gate)
 *   HUB_M=100            hub height
 *   PORT=8088            HTTP port for the live feed (/heatmap.json)
 *   OUT=./heatmap-data/uk.json   checkpoint file (also the resume source)
 *   LIMIT=0              cap number of points (0 = no cap; handy for testing)
 *   --dry-run            print the plan (point count) and exit, no API calls
 *   --no-mask            skip the UK land mask (grid the whole bbox)
 */

import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import pLimit from 'p-limit';
import {
  analyseSite,
  isPointInPolygon,
  pointToPolygonEdgeDistanceM,
  ScoringFactor,
  type FactorScore,
  type LatLng,
} from '@jamieblair/windforge-core';
import {
  cellStepDeg,
  parseWindSpeedMs,
  type HeatmapCell,
  type HeatmapData,
  type HeatmapMeta,
} from '../src/lib/heatmap';

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
// How far offshore (km from the UK coastline) to include sea points. UK offshore
// wind sits mostly within ~60 km; raise toward ~150 to reach Dogger Bank.
const OFFSHORE_KM = num('OFFSHORE_KM', 60);
const DRY_RUN = flags.has('--dry-run');
const USE_MASK = !flags.has('--no-mask');
const ONSHORE_ONLY = flags.has('--onshore-only');

// Window covering Great Britain, NI and surrounding UK waters (incl. southern
// North Sea). The masks below trim it to UK land + an offshore buffer.
const UK_WINDOW = { south: 49.3, north: 61.3, west: -9.5, east: 3.6 };
// Neighbouring coasts to exclude so their land isn't mistaken for UK sea.
const NEIGHBOURS = ['Ireland', 'France', 'Belgium', 'Netherlands'];
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'WindForge-Heatmap/0.1 (+https://wind.jamieblair.co.uk)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cellId = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

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
}

function buildGrid(
  classify: (p: LatLng) => { offshore: boolean } | null,
): { points: GridPoint[]; latStepDeg: number; lngStepDeg: number } {
  const midLat = (UK_WINDOW.north + UK_WINDOW.south) / 2;
  const { latStepDeg, lngStepDeg } = cellStepDeg(SPACING_KM, midLat);
  const points: GridPoint[] = [];
  for (let lat = UK_WINDOW.south + latStepDeg / 2; lat < UK_WINDOW.north; lat += latStepDeg) {
    for (let lng = UK_WINDOW.west + lngStepDeg / 2; lng < UK_WINDOW.east; lng += lngStepDeg) {
      const p = { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) };
      const cls = classify(p);
      if (cls) points.push({ ...p, offshore: cls.offshore });
    }
  }
  return { points, latStepDeg, lngStepDeg };
}

// ─── State + persistence ─────────────────────────────────────────────────

const results = new Map<string, HeatmapCell>();
let meta: HeatmapMeta;

async function loadCheckpoint(): Promise<void> {
  try {
    const raw = await readFile(OUT, 'utf8');
    const data = JSON.parse(raw) as HeatmapData;
    for (const cell of data.cells ?? []) results.set(cellId(cell.lat, cell.lng), cell);
    console.log(`[resume] loaded ${results.size} cells from ${OUT}`);
  } catch {
    // Fresh start.
  }
}

function snapshot(): HeatmapData {
  const cells = [...results.values()];
  return {
    meta: {
      ...meta,
      done: cells.length,
      failed: cells.filter((c) => c.error).length,
      complete: cells.length >= meta.total,
      updatedAt: new Date().toISOString(),
    },
    cells,
  };
}

let saveScheduled = false;
async function saveSoon(): Promise<void> {
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
      return { lat: p.lat, lng: p.lng, offshore: p.offshore, score: null, error: result.error.code };
    }
    const a = result.value;
    const wind = a.factors.find((f) => f.factor === ScoringFactor.WindResource);
    return {
      lat: p.lat,
      lng: p.lng,
      offshore: p.offshore,
      score: Math.round(a.compositeScore),
      confidence: overallConfidence(a.factors),
      windScore: wind ? Math.round(wind.score) : null,
      windSpeedMs: parseWindSpeedMs(wind?.detail),
      hardConstraints: a.hardConstraints.length,
    };
  } catch (err) {
    return { lat: p.lat, lng: p.lng, offshore: p.offshore, score: null, error: err instanceof Error ? err.message : 'failed' };
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

  const { points: allPoints, latStepDeg, lngStepDeg } = buildGrid(classify);
  const points = LIMIT > 0 ? allPoints.slice(0, LIMIT) : allPoints;
  const offshoreCount = points.filter((p) => p.offshore).length;

  meta = {
    bbox: UK_WINDOW,
    spacingKm: SPACING_KM,
    latStepDeg,
    lngStepDeg,
    hubHeightM: HUB_M,
    total: points.length,
    done: 0,
    failed: 0,
    complete: false,
    updatedAt: new Date().toISOString(),
    source: 'analyseSite (six-factor composite)',
  };

  console.log(
    `[plan] ${points.length} points (${points.length - offshoreCount} onshore + ${offshoreCount} offshore${ONSHORE_ONLY ? '' : ` ≤${OFFSHORE_KM}km`}) · spacing ${SPACING_KM}km · concurrency ${CONCURRENCY} · delay ${DELAY_MS}ms`,
  );
  const estMin = Math.round((points.length * DELAY_MS) / 60000);
  console.log(`[plan] rough lower bound ≈ ${estMin} min (network will add more)`);
  if (DRY_RUN) return;

  await loadCheckpoint();
  startServer();

  const todo = points.filter((p) => !results.has(cellId(p.lat, p.lng)));
  console.log(`[run] ${todo.length} remaining (${results.size} already done)`);

  const limit = pLimit(CONCURRENCY);
  let completed = results.size;
  await Promise.all(
    todo.map((p) =>
      limit(async () => {
        const cell = await analysePoint(p);
        results.set(cellId(p.lat, p.lng), cell);
        completed += 1;
        if (completed % 10 === 0 || completed === points.length) {
          console.log(`[run] ${completed}/${points.length}  (${Math.round((completed / points.length) * 100)}%)`);
        }
        void saveSoon();
      }),
    ),
  );

  // Final flush.
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(snapshot()));
  console.log(`[done] wrote ${results.size} cells to ${OUT}`);
  console.log('[done] HTTP feed still serving; Ctrl-C to stop.');
}

process.on('SIGINT', async () => {
  console.log('\n[exit] saving checkpoint…');
  try {
    await writeFile(OUT, JSON.stringify(snapshot()));
  } catch {
    // best effort
  }
  process.exit(0);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
