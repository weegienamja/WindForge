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

1. fetch the UK boundary from Nominatim (plus neighbouring coasts — Ireland,
   France, Belgium, Netherlands — to exclude their land) and classify each grid
   point as **onshore** (UK land) or **offshore** (sea within `OFFSHORE_KM` of the
   UK coast); foreign land and open ocean beyond the buffer are skipped,
2. generate the grid and **resume** from `./heatmap-data/uk.json` if present,
3. analyse each point with a global rate gate + low concurrency, writing the
   checkpoint as it goes,
4. serve the growing grid at `http://0.0.0.0:8088/heatmap.json` (CORS `*`).

A `Ctrl-C` saves a checkpoint; re-running resumes where it left off.

### Tuning (env vars)

| Var | Default | Notes |
|-----|---------|-------|
| `SPACING_KM` | `25` | Grid spacing. Lower = far more points + Overpass load. |
| `OFFSHORE_KM` | `60` | How far offshore to include sea points. Raise toward ~150 to reach Dogger Bank (many more points). |
| `CONCURRENCY` | `2` | Parallel analyses. Keep low to stay under Overpass limits. |
| `DELAY_MS` | `700` | Min ms between analysis starts (global rate gate). |
| `HUB_M` | `100` | Hub height. |
| `PORT` | `8088` | HTTP feed port. |
| `OUT` | `./heatmap-data/uk.json` | Checkpoint + resume file. |
| `LIMIT` | `0` | Cap point count (great for a quick smoke test). |
| `--dry-run` | – | Print the planned point count and exit. |
| `--onshore-only` | – | UK land only (skip the offshore buffer). |
| `--no-mask` | – | Skip all masks (grid the whole window). |

> **Offshore caveat:** the engine scores offshore points from wind resource with
> neutral terrain/grid/constraints — it does **not** model water depth (bathymetry)
> or distance to a grid connection, so offshore scores are an optimistic
> wind-resource proxy, not a full feasibility verdict. A future bathymetry layer
> would close that gap.

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

## Live fill from your own machine (no server)

Run the worker locally and tunnel it so the **deployed** `/map` fills in as each
point is computed (it polls the feed every ~6 s). One command:

```powershell
powershell -ExecutionPolicy Bypass -File packages\demo\scripts\heatmap-live.ps1
```

That script builds core, starts the worker in a new window (serving
`http://localhost:8088/heatmap.json`), opens a public HTTPS tunnel, and prints +
opens the `…/map?src=<tunnel>/heatmap.json` URL. It uses **Cloudflare Tunnel** if
`cloudflared` is installed (`winget install Cloudflare.cloudflared`), otherwise
falls back to **`ssh -R … localhost.run`** which needs no install on Windows 10/11.

Prefer to do it by hand? Two terminals:

```powershell
# 1) the worker
pnpm --filter @jamieblair/windforge-demo heatmap

# 2) a public HTTPS tunnel to it (no install):
ssh -o StrictHostKeyChecking=accept-new -R 80:localhost:8088 nokey@localhost.run
#   → prints e.g. https://abcd1234.lhr.life
```

Then open `https://wind.jamieblair.co.uk/map?src=https://abcd1234.lhr.life/heatmap.json`.

Notes:
- The tunnel URL changes each run; for a permanent default set
  `NEXT_PUBLIC_HEATMAP_URL` in Vercel to a **named** Cloudflare tunnel URL.
- It's near-live, not literally per-point: the page polls every few seconds and
  shows every point finished since the last poll. The full grid takes ~3 h
  (~5 points/min — each point hits four upstream APIs), and resumes if interrupted.
- Keep the worker + tunnel windows open; closing them stops the feed (the live app
  then falls back to the last committed snapshot).
