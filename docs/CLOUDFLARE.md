# Cloudflare deployment

Production: https://windforge.khmer-iq.workers.dev

The `windforge` Worker belongs to the Cloudflare account `4ffe352f3009f36d6ecff8ef2901b915`.
Its configuration is in `packages/demo/wrangler.jsonc`. OpenNext adapts the Next.js 15
server build for Workers with Node.js compatibility. Static assets include the public
heatmap snapshot, fonts, social image and immutable client bundles. API handlers run
on the Worker and keep provider requests on the server.

## Build, preview and deploy

Use Node.js 22–24 and the repository's pinned pnpm version. From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build:cloudflare
pnpm --filter @jamieblair/windforge-demo preview:cloudflare
```

The preview uses the actual Workers runtime. `pnpm preview:cloudflare` also performs
the build first. Linux is recommended for release builds; OpenNext's Windows support
is limited. CI validates the Worker bundle after the normal tests and Next.js build.

Authenticate with `pnpm --filter @jamieblair/windforge-demo exec wrangler login`, then:

```bash
pnpm deploy:cloudflare
```

This builds core, UI and the demo before publishing. To deploy an already verified
Worker bundle, run `pnpm --filter @jamieblair/windforge-demo deploy:cloudflare`.

For Cloudflare Workers Builds, use the repository root, build command
`pnpm build:cloudflare`, and deploy command
`pnpm --filter @jamieblair/windforge-demo deploy:cloudflare`. Select `main` as the
production branch and use the pinned package manager. GitHub's CI validates changes;
automatic publishing requires a connected Workers Builds project or a separately
configured deployment workflow.

## Configuration and caching

Basic analysis needs no secrets. If explicit CDS checks are needed, set the optional
server-only secret with `pnpm --filter @jamieblair/windforge-demo exec wrangler secret put CDS_API_KEY`.
Do not put credentials in Wrangler `vars`, public environment variables or source files.
The CDS health probe validates the token against the authenticated profile API;
an upstream outage is reported separately from an invalid token. A missing key
only affects the optional Copernicus integration, not standard site analysis.
For local Workers preview, copy `packages/demo/.dev.vars.example` to `.dev.vars` in the
same directory; this file and all generated deployment output are ignored by Git.

Prerendered pages use OpenNext's read-only static-assets incremental cache. Dynamic
analysis and health routes do not use ISR. This deployment needs no R2, KV, D1 or
Durable Object resources. Introducing runtime revalidation requires configuring a
writable cache before relying on that feature.

Overpass queries try the global OSM France mirror first, then Private.coffee and
the main Overpass instance. Each attempt has a 12-second HTTP budget and a
10-second query execution limit, leaving room for failover within the analysis
deadline. Caller cancellation stops retries. HTTP 200 responses containing an
Overpass error remark are rejected, including partial or empty results, and are
never cached as evidence of an unconstrained site. Successful feature results
retain the existing 24-hour in-process cache and full geometry.

Public mirrors can lag behind OSM updates. Analysis metadata records the returned
grid, land-use and road snapshot dates, and the UI warns when that evidence is
more than 30 days old. This remains preliminary screening data.

The long-running heatmap generator and its local SQLite database remain separate
from HTTP requests. They publish a public JSON feed or the committed snapshot as
described in [Heatmap pipeline](HEATMAP.md).

## Verification

After deployment, check `/`, `/analyse`, `/map`, `/opengraph-image`, `/heatmap.json`
and a geocoding request. Submit one real analysis and confirm either a valid result
or explicit missing-provider evidence. Invalid input must return a 400 response and
oversized bodies a 413. `/api/health` probes live upstreams; inspect degraded providers
without treating their failures as complete evidence. Confirm page metadata uses the
production URL and inspect Cloudflare Worker logs for runtime errors.
