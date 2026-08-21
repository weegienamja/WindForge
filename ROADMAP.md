# Roadmap

WindForge is an open-source screening toolkit. This roadmap distinguishes implemented capability from research or future feature work.

## Shipped

- Server-backed point analysis with explicit evidence completeness and nullable composite scores.
- Real Point, LineString, Polygon, and MultiPolygon constraint geometry, including holes, intersections, setbacks, and clipped developable area.
- NASA POWER wind history, Open-Elevation terrain sampling, OpenStreetMap infrastructure/land-use queries, and Nominatim regional context.
- Explicit ERA5 monthly retrieval for advanced callers and a tested reconciliation pipeline; the default analysis remains raw NASA POWER unless reanalysis is deliberately supplied.
- Weibull/power-curve AEP with a documented loss stack and deterministic downside sensitivities.
- Jensen and Bastankhah wake models, layout tools, shadow-flicker simulation, screening noise propagation, wind-condition screening, and financial models.
- React UI, Next.js public demo, local stdio MCP server, and resumable SQLite heatmap worker.
- A deterministic monorepo verification gate with 900+ tests, builds, lint, formatting, audit, and MCP package validation.

## Next project

- **Site Bisect:** compare and bisect candidate site boundaries while preserving the hardening invariants: real geometry, evidence provenance, incomplete-state propagation, and server-side provider access.

## Candidate future work

- Authoritative jurisdiction-specific environmental and planning datasets, each with licence and freshness metadata.
- Durable server-side caches and rate limiting for hosted public analysis.
- A validated CERRA aggregation workflow using a defensible temporal sample and reproducible CDS request.
- Land-cover-derived aerodynamic roughness rather than a fixed screening shear exponent.
- Scientific validation datasets and benchmark reports for individual models.
- Complete, reproducibly generated heatmap snapshots with recorded run manifests.

## Explicitly out of scope

- Formal planning, environmental, IEC, acoustic, or bankability certification.
- Claims that public gridded data replace mast or lidar measurements.
- Real-time SCADA, operational forecasting, accounts, billing, or a hosted MCP service.
- Treating incomplete OpenStreetMap coverage as proof that a constraint is absent.
