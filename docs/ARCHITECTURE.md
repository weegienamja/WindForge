# Architecture

## Design invariants

1. Provider credentials and provider execution that may need secrets stay on a trusted server.
2. A completed analysis owns one canonical resolved wind resource; downstream calculations consume it.
3. Missing evidence is data, not a neutral score.
4. Spatial decisions use feature geometry, not centroids or bounding-box stand-ins.
5. Public wording never exceeds the authority, resolution, or validation of its source/model.

## Monorepo boundaries

`packages/core` is the headless domain library. It contains fetch adapters but has no React dependency. `packages/ui` renders reusable results. `packages/mcp` validates tool input and invokes core over local stdio. `packages/demo` owns public HTTP boundaries, browser hooks, deployment health, and heatmap generation.

The public analyse page calls one same-origin endpoint. That endpoint validates a small request, runs site analysis and monthly history in parallel, and derives AEP from the analysis's `windResource.resolved`. Provider errors are converted to typed output; unexpected exceptions receive a generic client message.

## Data flow

```text
untrusted request
  -> server validation / abort deadline
  -> provider Results
  -> factor evidence + completeness
  -> raw/resolved wind resource
  -> dependent energy calculation
  -> serialisable response
```

Provider adapters have their own request validation, timeouts, conservative retries, and caches/coalescing where useful. No adapter is allowed to return a scientifically plausible placeholder on failure.

## Geometry flow

Overpass is requested with full element geometry. OSM nodes become points, ways become lines or closed polygons according to tags/closure, and relations become multipolygons with preserved inner rings. Constraints retain the geometry and evidence provenance. Turf performs intersection, distance, buffering, clipping, and area calculations.

## Deployment

The Next.js application deploys from `packages/demo`. `/api/analyse` and `/api/health` are dynamic Node routes with no-store responses. Only server routes can access `CDS_API_KEY`. Static/client bundles must contain no credential values.

## Change discipline

Geometry, provider, completeness, numerical semantics, and public wording changes require focused regression tests. The deterministic gate is `pnpm check`; live-provider validation and deployed browser verification are additional release checks.
