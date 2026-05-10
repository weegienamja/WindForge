/**
 * Generate a coarse global wind-field JSON for the landing-page particle layer.
 *
 * Two modes:
 *
 *   pnpm gen:wind-field            : synthetic geostrophic field (default,
 *                                    ~10s, no API calls, ~70KB output).
 *   pnpm gen:wind-field --live     : sweep NASA POWER for a representative
 *                                    January at the configured grid spacing.
 *                                    Slow (15-60 minutes) and rate-limited.
 *                                    Use `--limit 4` to cap concurrency
 *                                    (default).
 *
 * Output: packages/demo/public/wind-field.json
 *
 * Format: Array<{ lat, lng, u, v }> where u is east-west speed in m/s
 * (positive = eastward) and v is north-south speed in m/s (positive = northward).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Vector = { lat: number; lng: number; u: number; v: number };

const here = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(here, '..', 'public', 'wind-field.json');

const LAT_MIN = -60;
const LAT_MAX = 70;
const LNG_MIN = -180;
const LNG_MAX = 180;
const STEP_DEG = 5;

function buildGrid(): Array<{ lat: number; lng: number }> {
  const cells: Array<{ lat: number; lng: number }> = [];
  for (let lat = LAT_MIN; lat <= LAT_MAX; lat += STEP_DEG) {
    for (let lng = LNG_MIN; lng <= LNG_MAX; lng += STEP_DEG) {
      cells.push({ lat, lng });
    }
  }
  return cells;
}

/**
 * Synthetic field: a simplified general circulation model with trade winds
 * (easterlies in the tropics), prevailing westerlies in mid-latitudes, and
 * polar easterlies. Magnitude varies with latitude band and a small longitude
 * perturbation so the particles don't lock to perfect zonal flow.
 */
function syntheticField(cells: Array<{ lat: number; lng: number }>): Vector[] {
  return cells.map(({ lat, lng }) => {
    const latRad = (lat * Math.PI) / 180;
    const lngRad = (lng * Math.PI) / 180;

    // Zonal (east-west) component: trade winds, westerlies, polar easterlies.
    let u = 0;
    if (Math.abs(lat) < 30) {
      // Trade winds, easterlies → negative u.
      u = -6 * Math.cos(latRad * 3);
    } else if (Math.abs(lat) < 60) {
      // Westerlies → positive u.
      u = 8 * Math.cos((lat - 45) * (Math.PI / 30));
    } else {
      // Polar easterlies → negative u.
      u = -4 * Math.cos((Math.abs(lat) - 75) * (Math.PI / 15));
    }

    // Meridional (north-south) component: small, with longitudinal variation
    // mimicking standing waves.
    const v = 2.5 * Math.sin(lngRad * 2 + latRad);

    // Add a small spatial noise term that's deterministic so the build is
    // reproducible.
    const noiseU = 1.5 * Math.sin(lat * 0.7 + lng * 0.31);
    const noiseV = 1.2 * Math.cos(lat * 0.4 - lng * 0.27);

    return {
      lat,
      lng,
      u: Number((u + noiseU).toFixed(3)),
      v: Number((v + noiseV).toFixed(3)),
    };
  });
}

async function liveField(cells: Array<{ lat: number; lng: number }>, limitN: number): Promise<Vector[]> {
  // Lazy import so the synthetic path doesn't require core to be built.
  const { fetchMonthlyWindHistory } = await import('@jamieblair/windforge-core');
  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(limitN);

  const results: Vector[] = [];
  let done = 0;

  await Promise.all(
    cells.map((cell) =>
      limit(async () => {
        try {
          const result = await fetchMonthlyWindHistory({ lat: cell.lat, lng: cell.lng }, 1);
          done += 1;
          if (done % 50 === 0) {
            process.stderr.write(`  ${done}/${cells.length} cells fetched\n`);
          }
          if (!result.ok) {
            results.push({ lat: cell.lat, lng: cell.lng, u: 0, v: 0 });
            return;
          }
          // Pick January if available; otherwise the first record.
          const records = result.value.records;
          const jan = records.find((r) => r.month === 1) ?? records[0];
          if (!jan) {
            results.push({ lat: cell.lat, lng: cell.lng, u: 0, v: 0 });
            return;
          }
          // Convert speed + direction (degrees from north) to u/v components.
          const speed = jan.ws50m ?? jan.ws10m ?? 0;
          const dirRad = ((jan.wd50m ?? jan.wd10m ?? 0) * Math.PI) / 180;
          // Met convention: direction wind comes from. u = east, v = north.
          const u = -speed * Math.sin(dirRad);
          const v = -speed * Math.cos(dirRad);
          results.push({
            lat: cell.lat,
            lng: cell.lng,
            u: Number(u.toFixed(3)),
            v: Number(v.toFixed(3)),
          });
        } catch {
          results.push({ lat: cell.lat, lng: cell.lng, u: 0, v: 0 });
        }
      }),
    ),
  );

  results.sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  return results;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const live = argv.includes('--live');
  const limitArg = argv.indexOf('--limit');
  const limitN = limitArg >= 0 ? Number(argv[limitArg + 1]) || 4 : 4;

  const cells = buildGrid();
  process.stderr.write(`Building wind field: ${cells.length} cells, mode=${live ? 'live' : 'synthetic'}\n`);

  const vectors = live ? await liveField(cells, limitN) : syntheticField(cells);

  mkdirSync(dirname(OUTPUT), { recursive: true });
  const json = JSON.stringify(vectors);
  writeFileSync(OUTPUT, json);
  process.stderr.write(`Wrote ${OUTPUT} (${(json.length / 1024).toFixed(1)} KB, ${vectors.length} vectors)\n`);
}

main().catch((err) => {
  process.stderr.write(`Failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
