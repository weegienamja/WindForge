# API guide

This guide covers the main public contracts. The generated TypeScript declarations in each package are the exhaustive reference.

## Result handling

Fallible core functions return `Result<T, ScoringError>`:

```ts
const result = await analyseSite(options);
if (!result.ok) {
  console.error(result.error.code, result.error.message);
  return;
}
```

Provider errors are structured. Callers should not assume a successful top-level result has every optional section; inspect completeness and evidence.

Boundary validators return `cleanedData: null` when scientific inputs are invalid. Missing/NaN wind or elevation fields are never replaced with zero. Multi-height wind records use `null` for an unavailable measurement height or direction.

## Point analysis

```ts
analyseSite(options: AnalysisOptions): Promise<Result<SiteAnalysis, ScoringError>>
```

Required input is a WGS84 coordinate. Optional inputs include hub height, scoring weights, an abort signal, and a pre-fetched reanalysis override.

Important result fields:

```ts
interface SiteAnalysis {
  coordinate: LatLng;
  compositeScore: number | null;
  windResource: WindResourceResult | null;
  factors: FactorScore[];
  hardConstraints: Constraint[];
  warnings: Warning[];
  metadata: AnalysisMetadata;
}
```

`compositeScore` is `null` when required evidence is missing. `metadata.completeness` explains eligibility; `metadata.evidence` reports each provider/factor state. `windResource.resolved` is the single resource downstream energy calculations should consume.

`AnalysisOptions.cdsApiKey` is deprecated and ignored. Secret-backed retrieval must be performed by a trusted server caller, which can pass validated data through `reanalysis`.

## Wind history and reanalysis

```ts
fetchMonthlyWindHistory(coordinate, yearsBack?, signal?)
fetchEra5MonthlyHistory(coordinate, options)
reconcileWindData(input)
fetchReconciledWindHistory(coordinate, options)
```

NASA history is public. ERA5 requires a server-side CDS key and uses asynchronous job submission/polling. `fetchReconciledWindHistory` only attempts ERA5 when explicitly configured.

`fetchCerraWindData` and `fetchCerraMonthlyHistory` currently return an explicit disabled/configuration error; they do not return placeholder values. `parseCerraNetCdf` remains exported for controlled parsing tests/research.

## Energy yield

```ts
calculateAep(wind, turbine, options?): Result<EnergyYieldResult, ScoringError>
```

The calculation integrates a Weibull wind distribution with the turbine power curve, air-density and loss assumptions. It returns gross/net AEP, capacity factors, monthly production, and three deterministic scenarios:

```ts
centralEstimate
downside10
downside20
```

The downside cases scale net production by 10% and 20%. They are sensitivity cases, not exceedance probabilities.

## Constraint geometry and site assessment

```ts
createBoundary(polygon, name?)
detectConstraints(boundary, options?)
buildExclusionGeometry(boundary, constraints)
assessSite(boundary, options?)
```

Detected features can carry Point, LineString, MultiLineString, Polygon, or MultiPolygon geometry and evidence provenance. Intersections, distances, buffers, holes, and clipped areas operate on actual geometry. OSM-derived designations remain supplementary screening evidence.

## Screening models

- `assessNoiseScreening` and propagation/contour functions provide simplified ISO 9613-2-style noise screening. `assessEtsuCompliance` remains as a deprecated compatibility alias.
- Hourly provider data can produce a clearly labelled variability proxy; daily means return an unsupported state and no IEC turbulence category.
- Extreme-wind helpers fit a coarse return level to the supplied mean-speed series. They do not report a one-year value or infer an IEC class; insufficient values are `null`, not zero.
- Terrain-flow, wake, layout, shadow-flicker, viewshed, cumulative-impact, and financial modules are pre-feasibility tools whose assumptions are returned with their results.

## Reports

```ts
generateScreeningSiteReport(...): ScreeningSiteReport
```

The report identifies itself as screening-level and includes a disclaimer. `generateIecSiteReport` and `IecSiteReport` remain deprecated aliases for source compatibility; the output is not an IEC compliance report.

## Next.js analysis endpoint

The demo exposes `POST /api/analyse` with the typed contract in `packages/demo/src/lib/analysis-api.ts`:

```json
{
  "coordinate": { "lat": 55.86, "lng": -4.25 },
  "hubHeightM": 100,
  "turbineId": "vestas-v90-2mw"
}
```

The route validates coordinate ranges, allowed hub heights, turbine ids, and a 2 KiB body limit; applies a 45-second abort; disables caching; and keeps provider access server-side. A successful response has separately named `auxiliaryErrors.windHistory` and `auxiliaryErrors.energyYield` fields so partial failures cannot be misattributed.
