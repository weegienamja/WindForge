# UK suitability heatmap

A precomputed, land-masked grid of the full six-factor `analyseSite` score across
the UK, rendered on `/map`. A batch **worker** computes the grid and serves it over
HTTP; the page polls that feed and fills in live.

## Why a separate worker (not on Vercel)

Running `analyseSite` per grid point hits NASA POWER, Open-Elevation, OSM Overpass
(×4) and Nominatim. Overpass/Open-Elevation public endpoints throttle aggressively,
so the run must be **slow, polite and resumable** — and long-running, which a
serverless function can't host. The worker is built for that; the Vercel app only
renders the result.

> **Resolution reality:** `analyseSite`'s wind input (NASA POWER) is ~50 km native,
> so 25 km spacing is the natural floor for *new information*. Sampling finer just
> interpolates the same values **and** multiplies Overpass load. To go genuinely
> high-resolution you need a self-hosted Overpass + a local elevation DEM (a much
> bigger box than a CX23) — the worker's `SPACING_KM` is ready for that day.

## Run it on the Hetzner box

```bash
git clone https://github.com/weegienamja/WindForge.git
cd WindForge
corepack enable && pnpm install
pnpm --filter @jamieblair/windforge-core build   # the worker imports the built core

# Start the worker (defaults: 25 km grid, concurrency 2, ~700 ms between starts)
pnpm --filter @jamieblair/windforge-demo heatmap
```

It will:

1. fetch the UK boundary from Nominatim and build a land mask (falls back to the
   bounding box if that fails),
2. generate the land grid and **resume** from `./heatmap-data/uk.json` if present,
3. analyse each point with a global rate gate + low concurrency, writing the
   checkpoint as it goes,
4. serve the growing grid at `http://0.0.0.0:8088/heatmap.json` (CORS `*`).

A `Ctrl-C` saves a checkpoint; re-running resumes where it left off.

### Tuning (env vars)

| Var | Default | Notes |
|-----|---------|-------|
| `SPACING_KM` | `25` | Grid spacing. Lower = far more points + Overpass load. |
| `CONCURRENCY` | `2` | Parallel analyses. Keep low to stay under Overpass limits. |
| `DELAY_MS` | `700` | Min ms between analysis starts (global rate gate). |
| `HUB_M` | `100` | Hub height. |
| `PORT` | `8088` | HTTP feed port. |
| `OUT` | `./heatmap-data/uk.json` | Checkpoint + resume file. |
| `LIMIT` | `0` | Cap point count (great for a quick smoke test). |
| `--dry-run` | – | Print the planned point count and exit. |
| `--no-mask` | – | Skip the land mask (grid the whole bbox). |

Smoke test first:

```bash
LIMIT=15 DELAY_MS=300 pnpm --filter @jamieblair/windforge-demo heatmap
# in another shell:
curl -s localhost:8088/heatmap.json | head -c 400
```

## Point the page at the feed

The `/map` page reads, in order: a `?src=` query param, then
`NEXT_PUBLIC_HEATMAP_URL` (build-time), then the committed `/public/heatmap.json`
snapshot.

- **Quick / ad-hoc:** open `https://your-app/map?src=http://YOUR_BOX:8088/heatmap.json`
  (expose the port; ideally behind HTTPS so the browser doesn't block mixed content).
- **Permanent live feed:** set `NEXT_PUBLIC_HEATMAP_URL` in Vercel to the worker URL
  and redeploy.
- **Static snapshot:** copy the finished `uk.json` to
  `packages/demo/public/heatmap.json`, commit, deploy — no worker needed at runtime.

### Serving the feed over HTTPS

The Vercel site is HTTPS, so a plain `http://` feed will be blocked as mixed content.
Easiest fix: put the worker behind a reverse proxy with TLS (Caddy one-liner:
`caddy reverse-proxy --from your-domain --to :8088`), or upload the checkpoint file
periodically to object storage / a CDN and point `?src=` at that URL.
