/**
 * Convert a Global Wind Atlas country GeoTIFF (250 m mean wind speed) into a
 * coloured PNG overlay + bounds JSON for the /map "Wind Atlas" layer.
 *
 * Downsamples to 500 m by default (2x2 mean) to keep the asset light, and
 * percentile-stretches the colour ramp so the map shows real contrast.
 *
 *   # one-off: download the UK raster, then build the overlay
 *   curl -sL -o packages/demo/heatmap-data/GBR_wind-speed_100m.tif \
 *     https://globalwindatlas.info/api/gis/country/GBR/wind-speed/100
 *   pnpm --filter @jamieblair/windforge-demo gwa
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fromFile } from 'geotiff';
import { PNG } from 'pngjs';
import { scoreColor } from '../src/lib/heatmap';

const SRC = process.env.GWA_TIF ?? './heatmap-data/GBR_wind-speed_100m.tif';
const OUT_PNG = process.env.GWA_OUT ?? './public/gwa/uk-wind-100m.png';
const OUT_META = OUT_PNG.replace(/\.png$/, '.json');
const DOWNSAMPLE = Math.max(1, Number(process.env.DOWNSAMPLE ?? 2)); // 250m * 2 = 500m
const NATIVE_M = 250;

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function isValid(v: number, nodata: number | null): boolean {
  return Number.isFinite(v) && v > 0 && v < 40 && (nodata === null || v !== nodata);
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i] as number;
}

async function main(): Promise<void> {
  console.log(`[gwa] reading ${SRC}`);
  const tiff = await fromFile(SRC);
  const image = await tiff.getImage();
  const W = image.getWidth();
  const H = image.getHeight();
  const [minX, minY, maxX, maxY] = image.getBoundingBox();
  const nodata = image.getGDALNoData();
  console.log(`[gwa] ${W}x${H}px · bbox [${minX.toFixed(2)},${minY.toFixed(2)} → ${maxX.toFixed(2)},${maxY.toFixed(2)}] · nodata ${nodata}`);
  if (minX < -20 || maxX > 10 || minY < 40 || maxY > 65) {
    console.warn('[gwa] bbox does not look like EPSG:4326 lat/lng — overlay may be misplaced.');
  }

  const rasters = await image.readRasters({ interleave: false });
  const band = rasters[0] as unknown as ArrayLike<number>;

  const ow = Math.floor(W / DOWNSAMPLE);
  const oh = Math.floor(H / DOWNSAMPLE);
  const vals = new Float64Array(ow * oh);
  const valid = new Uint8Array(ow * oh);
  const validList: number[] = [];

  for (let oy = 0; oy < oh; oy += 1) {
    for (let ox = 0; ox < ow; ox += 1) {
      let sum = 0;
      let n = 0;
      for (let dy = 0; dy < DOWNSAMPLE; dy += 1) {
        for (let dx = 0; dx < DOWNSAMPLE; dx += 1) {
          const x = ox * DOWNSAMPLE + dx;
          const y = oy * DOWNSAMPLE + dy;
          if (x < W && y < H) {
            const v = band[y * W + x] as number;
            if (isValid(v, nodata)) {
              sum += v;
              n += 1;
            }
          }
        }
      }
      const idx = oy * ow + ox;
      if (n > 0) {
        const mean = sum / n;
        vals[idx] = mean;
        valid[idx] = 1;
        validList.push(mean);
      }
    }
  }

  validList.sort((a, b) => a - b);
  const lo = quantile(validList, 0.02);
  const hi = Math.max(lo + 0.1, quantile(validList, 0.98));
  const realMin = validList[0] ?? 0;
  const realMax = validList[validList.length - 1] ?? 0;
  console.log(
    `[gwa] ${validList.length} valid cells · stretch ${lo.toFixed(1)}–${hi.toFixed(1)} m/s · range ${realMin.toFixed(1)}–${realMax.toFixed(1)}`,
  );

  const png = new PNG({ width: ow, height: oh });
  for (let i = 0; i < ow * oh; i += 1) {
    const o = i * 4;
    if (valid[i]) {
      const t = Math.max(0, Math.min(1, (vals[i] - lo) / (hi - lo)));
      const [r, g, b] = hexToRgb(scoreColor(t * 100));
      png.data[o] = r;
      png.data[o + 1] = g;
      png.data[o + 2] = b;
      png.data[o + 3] = 210;
    } else {
      png.data[o + 3] = 0; // transparent (sea / outside country)
    }
  }

  await mkdir(dirname(OUT_PNG), { recursive: true });
  await writeFile(OUT_PNG, PNG.sync.write(png));
  await writeFile(
    OUT_META,
    JSON.stringify(
      {
        // Leaflet LatLngBounds order: [[south, west], [north, east]]
        bounds: [
          [minY, minX],
          [maxY, maxX],
        ],
        width: ow,
        height: oh,
        resolutionM: NATIVE_M * DOWNSAMPLE,
        heightM: 100,
        minMs: Number(realMin.toFixed(2)),
        maxMs: Number(realMax.toFixed(2)),
        stretchLoMs: Number(lo.toFixed(2)),
        stretchHiMs: Number(hi.toFixed(2)),
        source: 'Global Wind Atlas v3 (DTU/World Bank), 100 m mean wind speed',
      },
      null,
      2,
    ),
  );
  console.log(`[gwa] wrote ${OUT_PNG} (${ow}x${oh}) + ${OUT_META}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
