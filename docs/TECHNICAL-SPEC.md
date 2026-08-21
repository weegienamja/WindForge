# Technical specification

## Purpose and release boundary

WindForge is a TypeScript pre-feasibility toolkit for wind-energy site screening. It explains public evidence and provides engineering approximations. No output is a statutory search, planning opinion, certified IEC assessment, acoustic compliance result, or bankable energy estimate.

## Packages

| Package | Responsibility |
| --- | --- |
| `@jamieblair/windforge-core` | Domain types, provider adapters, scoring, geometry, energy and screening models |
| `@jamieblair/windforge` | Reusable React presentation components |
| `@jamieblair/windforge-mcp` | Seven validated tools over local MCP stdio |
| `@jamieblair/windforge-demo` | Next.js app, server analysis API, health route, and heatmap worker |

Node.js 22–24 and pnpm 9 are the supported development range.

## Public analysis flow

```text
browser
  -> POST /api/analyse (validation, body limit, no-store, timeout)
  -> core analyseSite + public providers
  -> canonical windResource.raw/resolved
  -> AEP from windResource.resolved
  -> typed response with completeness and auxiliary failures
  -> browser presentation
```

Credentials never cross the browser boundary. The default flow does not automatically start long-running CDS jobs. The health route is runtime-dynamic so it observes server environment and current provider status.

## Scoring and completeness

Default weights are wind 0.35, terrain 0.20, grid 0.15, land use 0.15, planning 0.10, and access 0.05. Weights are normalised when overridden.

Every factor requires actual evidence. Missing required evidence is not assigned a score of 50. Completeness states are:

- `complete`: required evidence is available;
- `degraded`: the composite is still valid for its declared raw-data scope, but optional evidence such as reanalysis was not applied;
- `materially_incomplete`: one or more non-wind required factors are absent and the composite is withheld;
- `indeterminate`: wind evidence is absent and the composite is withheld.

The result records source use/failure, per-factor evidence state, timestamps, hub height, wind-shear basis, and correction provenance.
SDK validators and temporal analysis helpers likewise preserve absence as `null` or omit unsupported bins rather than manufacturing zero-valued observations.

## Wind resource

NASA POWER is the default long-term gridded resource. Hub-height extrapolation uses an explicit fixed open-terrain exponent (`alpha = 0.14`); elevation variance is not used as aerodynamic roughness.

ERA5 monthly history can be fetched explicitly through the current CDS retrieve-v1 job API and supplied to reconciliation. CERRA automatic retrieval is disabled until a defensible temporal aggregation is implemented. The canonical resolved wind summary is shared by scoring and AEP.

## Geometry

OSM nodes, ways, and multipolygon relations are converted to GeoJSON. Relation rings are stitched; inner rings are preserved as holes. Turf-backed operations provide feature/site intersection, nearest distance, buffering, clipping, and area. Layout and site sampling exclude polygon holes.

Constraint labels state evidence quality. Generic OSM protected-area tags are not translated into an asserted SSSI/SAC/SPA designation. Flood-zone and steep-slope definitions without authoritative end-to-end queries are reserved/hidden rather than presented as detected evidence.

## Numerical model presentation

| Module | Public interpretation |
| --- | --- |
| AEP | Weibull and power-curve screening estimate with explicit loss assumptions; 10%/20% deterministic downside cases |
| Noise | Simplified ISO 9613-2-style propagation screen; not ETSU compliance |
| Turbulence | Hourly-mean variability proxy only; daily means are rejected and no IEC category is assigned |
| Extreme wind | Coarse mean-speed return level; no gust/extreme claim, one-year value, or IEC class |
| Terrain flow | Simplified screening approximation; not microscale modelling or CFD |
| Wakes | Jensen/Bastankhah engineering models without field validation |
| Finance | Scenario arithmetic driven by screening AEP and user/default assumptions, not investment advice |

## Heatmap storage

The worker streams a grid into normalised SQLite tables, records run status/counts, and resumes successful cells. Failed cells remain retryable. Schema version 2 stores central/downside energy sensitivities and migrates legacy P-labelled columns. Generated databases, journals, downloads, and checkpoints are ignored.

The committed web snapshot is partial. The UI reports completion, successful/failed counts where available, timestamp, spacing, source, and non-authoritative limitations.

## Verification

`pnpm check` is authoritative and runs formatting, lint, TypeScript checks, all deterministic tests, package/demo builds, and MCP publish validation. CI then runs a high-severity production dependency audit. Live provider tests are manual/optional and never define deterministic scientific validation.
