# Data sources and evidence quality

WindForge's default point analysis uses public services without credentials. Availability, spatial resolution, completeness, and licensing differ by provider, so every analysis carries source and failure metadata.

## Default providers

| Provider | Runtime role | Typical limitations | Failure behaviour |
| --- | --- | --- | --- |
| NASA POWER | Long-term wind summary and monthly history | Coarse global grid; not a site measurement | Wind factor is unavailable and the composite is withheld |
| Open-Elevation | Elevation samples used to derive slope and aspect | Resolution/underlying DEM varies; outages occur | Terrain factor is unavailable and the composite is withheld |
| OpenStreetMap Overpass | Grid, roads, land use, protected-area tags, receptors, existing wind assets | Contributed data is incomplete and non-authoritative | Affected factors are unavailable; absence is not treated as clear evidence |
| Nominatim | Country/region context and place labels | Geocoding context is not a planning database | Planning factor becomes unavailable when required context cannot be retrieved |

All outbound requests use timeouts and structured errors. The Overpass adapters use form-encoded POST requests, JSON response negotiation, identifying user-agent headers, conservative retry behaviour, and alternate public endpoints. NASA monthly requests for the same coordinate/window are coalesced while in flight.

## NASA POWER

The analysis uses NASA POWER climatology/monthly point data including wind speed at 2 m, 10 m, and 50 m and wind direction where available. Its roughly 0.5° × 0.625° grid cannot resolve a candidate parcel, local obstacles, or complex-terrain flow. WindForge applies a fixed open-terrain power-law exponent of 0.14 for hub-height screening and records that assumption. It does not infer aerodynamic roughness from elevation.

NASA POWER is suitable for regional pre-screening, not bankable yield prediction.

## ERA5 via the Copernicus Climate Data Store

The optional ERA5 adapter uses the current CDS retrieve-v1 process/job API:

1. submit a dataset request;
2. poll the returned job;
3. obtain a result asset;
4. parse monthly wind history from NetCDF.

It requires a server-side `CDS_API_KEY`. Queue time can be minutes. ERA5 is not fetched automatically by `analyseSite` or by the public browser flow. An advanced caller must retrieve, inspect, and pass a reanalysis source explicitly. Deterministic CI mocks this boundary and does not consume CDS quota.

## CERRA

CERRA domain checks and NetCDF parsing utilities remain available for controlled research, but automated CERRA retrieval/correction is disabled in this release. The former request sampled one sub-daily instant per month, which is not a valid monthly climatology. The API returns an explicit configuration error instead of a plausible-looking result.

## OpenStreetMap evidence

WindForge requests node, way, and relation geometry and converts it to Point, LineString, Polygon, or MultiPolygon features. Distances are measured to feature geometry, not centres. Setbacks buffer the actual feature and are clipped to the site polygon.

OpenStreetMap tags such as `boundary=protected_area` are supplementary screening evidence. They do not establish a statutory SSSI, SAC, SPA, flood-zone, aviation, or other designation unless the exact authoritative designation and source are independently known. Flood-zone and steep-slope concepts that lack an implemented authoritative end-to-end source are not advertised as detected constraints.

OpenStreetMap data is © OpenStreetMap contributors and available under ODbL. Applications using WindForge remain responsible for attribution and upstream terms.

## Provider health

`GET /api/health` performs uncached runtime probes for the public demo's providers. It reports `ok`, `degraded`, or `error` without returning credential values. CDS is reported as not configured when no server-side key exists. A healthy probe means the endpoint responded at that moment; it is not a guarantee that a later long-running analysis will succeed.

## What missing evidence means

WindForge distinguishes complete, degraded, materially incomplete, and indeterminate results. Optional reanalysis not being configured is a visible degradation but does not invalidate raw NASA screening. Failure of a required scoring source suppresses the composite score. Individual successful factors can still be displayed with their provenance.
