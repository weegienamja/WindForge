# UK heatmap pipeline

`packages/demo/scripts/generate-heatmap.ts` is a slow, polite, resumable worker for coarse screening cells. It is separate from Vercel because a run can take hours and public providers rate-limit sustained requests.

## Truthfulness boundary

The committed `/public/heatmap.json` is a partial snapshot, not complete UK coverage. `/map` shows whether its source is a partial static snapshot or a live partial feed, plus cell count, planned count/coverage where present, generation timestamp, spacing, and source limitations. A failed cell is not counted as successfully complete and remains eligible for retry.

NASA POWER is much coarser than a parcel, so reducing grid spacing does not create higher-resolution wind evidence. Offshore composite cells are explicitly marked unsupported because bathymetry and offshore-grid evidence are absent. The optional Global Wind Atlas raster is a separate wind-only visual layer and is not part of the six-factor score.

## Run

```bash
pnpm --filter @jamieblair/windforge-core build
pnpm --filter @jamieblair/windforge-demo heatmap --dry-run
pnpm --filter @jamieblair/windforge-demo heatmap
```

Important environment controls include `BBOX`, `SPACING_KM`, `OFFSHORE_KM`, `CONCURRENCY`, `DELAY_MS`, `HUB_M`, `DB`, `OUT`, `MAX_FEED`, `LIMIT`, and `PORT`. CLI filters include `--landuse`, `--farmland-only`, `--onshore-only`, `--no-mask`, and `--dry-run`. Keep concurrency/delay conservative when using public Overpass, Nominatim, and Open-Elevation infrastructure.

## SQLite store

The worker uses Node's built-in SQLite implementation. Normalised tables cover cells, wind, terrain, grid/access, geocoding, optional reconciliation diagnostics, energy, economics, factor scores, constraints, site assessments, runs, and metadata.

Schema version 2 stores `central_estimate_mwh`, `downside_10_mwh`, and `downside_20_mwh` and migrates legacy P-labelled columns. Run records include started/finished timestamps, status, planned/completed/failed counts, bounding box, spacing, hub height, and notes. Resume checks only successful site assessments; error rows are retryable.

Generated databases, journals, cached land-use/provider files, and checkpoints are gitignored. Only an intentionally reviewed JSON/image web snapshot should be committed.

## Web source selection

`/map` chooses a source in this order:

1. an explicit `?src=` URL;
2. `NEXT_PUBLIC_HEATMAP_URL` (intentionally public, contains no credential);
3. the committed `/heatmap.json` snapshot.

An HTTPS deployment cannot load a plain HTTP feed because browsers block mixed content. Treat ad-hoc feed URLs as untrusted public input and do not embed tokens in them.
