# WindForge contributor instructions

WindForge is an open-source TypeScript toolkit and demo for early-stage wind-site screening. It helps compare candidate locations and expose evidence that needs deeper investigation. It is not a planning search, statutory designation search, IEC determination, acoustic compliance tool, engineering design, or bankable energy assessment.

## Repository shape

- `packages/core`: provider adapters, geospatial evidence, deterministic scoring, screening models, and domain types. It must not depend on React or browser APIs.
- `packages/ui`: reusable React presentation components. It consumes core results and must preserve missing/degraded states.
- `packages/demo`: Next.js App Router demo. Provider orchestration runs through server routes; private credentials never enter client components.
- `packages/mcp`: MCP interface over the same core behaviours.
- `docs`: public architecture, API, data-source, and model-boundary documentation.

Use pnpm, Turborepo, strict TypeScript, Vitest, and Biome. `pnpm check` is the authoritative release gate.

## Non-negotiable correctness rules

1. Missing evidence is not neutral or positive evidence. Propagate provider failures and suppress a composite score when required factors are unavailable.
2. A completed analysis has one canonical resolved wind resource. AEP and other downstream calculations consume it rather than fetching a separate wind climate.
3. Private provider credentials stay server-side. Do not add confidential `NEXT_PUBLIC_*` variables.
4. Preserve real OSM geometry. Use point, line, polygon, and multipolygon intersections/distances; never reduce a way or relation to its centroid for constraint reasoning.
5. OSM is supplementary screening evidence, not an authoritative statutory search. Public copy should say “configured screening exclusion” or “screening caution”; `hardConstraints` remains a legacy schema name.
6. Use `null` or an explicit unavailable state for missing model outputs. Do not encode missing values as zero or a plausible default.
7. Provider-derived hourly/daily/monthly means do not establish IEC turbulence or extreme-wind classes. Keep model limitations adjacent to outputs.
8. AEP downside scenarios are deterministic sensitivities, not professional P50/P75/P90 estimates.
9. Noise and shadow outputs are screening comparisons, not compliance findings.
10. The heatmap must expose coverage and completion metadata. Never present a partial snapshot as UK-wide coverage.

## Provider and API behaviour

- Apply bounded timeouts and restrained retry behaviour to public providers.
- Validate inputs and response shapes at server boundaries.
- Return structured, non-sensitive errors. Do not expose upstream credentials, authorization headers, raw exception details, or private URLs.
- Ordinary tests and CI must be deterministic and must not require live providers or CDS credentials.
- ERA retrieval uses the current asynchronous CDS retrieve API and a server-only `CDS_API_KEY`. CERRA automated retrieval is intentionally unavailable until a supported workflow exists.

## Change expectations

- Trace the runtime path before changing model behaviour.
- Add regression tests for provider failure, incompleteness, geometry, API validation, and numerical edge cases.
- Update public wording and documentation whenever evidence quality or model semantics change.
- Prefer defensible smaller capabilities to impressive but weakly supported outputs.
- Do not add new scientific models, data providers, dashboards, or product features during maintenance unless they are necessary to repair existing behaviour.

See `README.md`, `docs/ARCHITECTURE.md`, `docs/DATA-SOURCES.md`, `docs/TECHNICAL-SPEC.md`, and `CONTRIBUTING.md` for the current public contract.
