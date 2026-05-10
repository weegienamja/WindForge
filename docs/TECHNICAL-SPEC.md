# WindForge Technical Specification

**Version:** May 2026
**Status:** All 925 tests passing (760 core + 24 UI + 63 MCP + 78 demo)
**Audience:** Engineers, AI agents, contributors needing a single document that explains *what WindForge is, what it measures, every file, and where to extend it*.

---

## 1. Executive summary

WindForge is a TypeScript decision-support platform for wind turbine site suitability. It is **not** an "AI placement" tool. It pulls from public meteorological, terrain, and infrastructure datasets, runs a stack of physics-grounded models (wind shear, Jensen / Bastankhah wakes, ISO 9613-2 noise, solar ephemeris shadow flicker, Gumbel extreme wind, Weibull energy yield, IEC 61400-1 turbulence, financial NPV/IRR/LCOE) and returns explained, weighted scores plus per-domain numerical results. Every output is inspectable; humans always make the final call.

Architecture: pnpm + Turborepo monorepo with a strict split between a pure-TS `core` (no React, no DOM) and a React `ui` layer.

```
packages/
  core/   pure TypeScript, runs in Node / Deno / Bun / browser
  ui/     React 18, Recharts, react-leaflet
  demo/   Next.js 15 showcase app
```

### 1.1 Bug fixes & hardening applied in this pass

| # | File | Defect | Fix |
|---|------|--------|-----|
| 1 | `packages/ui/src/components/WindSpeedDistribution.tsx` | `useMemo` was placed **after** an early `if (loading) return ...`, violating React's Rules of Hooks. The component would crash when `loading` toggled. | Hook moved above all conditional returns; `data?.bins?` made null-safe. |
| 2 | `packages/ui/src/components/SiteMap.tsx` (`BoundsWatcher`) | Debounce `setTimeout` was never cleared on unmount, retaining a closure over the Leaflet map after teardown (memory leak + potential callback against unmounted map). | Added `useEffect` cleanup that clears the timer on unmount. |
| 3 | `packages/core/src/cumulative/cumulative-impact.ts` | Existing turbine IDs were offset by a hard-coded `+10000`, which silently collides if proposed turbine IDs are >= 10000 (e.g. OSM-derived numeric IDs are routinely larger). | Offset is now `max(proposedId) + 1`, computed dynamically, then `i` per turbine - guaranteed unique. |
| 4 | `packages/core/src/datasources/osm-overpass.ts` and `packages/core/src/constraints/constraint-queries.ts` | Voltage filter `^[1-9][0-9]{5,}$` skipped OSM tags storing semicolon-separated voltages such as `"132000;33000"`, materially undercounting transmission lines on combined-circuit pylons. | Regex relaxed to `(^|;)[1-9][0-9]{5,}($|;)`; constant exported as `GRID_VOLTAGE_REGEX`. |

All fixes are covered by the existing test suite (no regressions). No production behaviour changed for callers using clean inputs - the fixes only correct edge cases that were silently wrong.

---

## 2. What it measures (the data flow)

```
+-----------------+      +------------------+      +------------------+
|   PUBLIC APIs   |  ->  |   CORE ENGINE    |  ->  |  OUTPUT SURFACES |
+-----------------+      +------------------+      +------------------+
| NASA POWER      |      | wind shear (a)   |      | SiteAnalysis     |
| Open-Elevation  |      | 6-factor scoring |      | SiteAssessment   |
| OSM Overpass    |      | constraint det.  |      | EnergyYieldResult|
| OSM Nominatim   |      | wake (Jensen/    |      | NoiseResult +    |
| ERA5 (opt.)     |      |  Bastankhah)     |      |   ETSU compliance|
| CERRA (opt.)    |      | noise ISO 9613-2 |      | ShadowFlicker +  |
| Met-mast CSV    |      | shadow flicker   |      |   compliance     |
+-----------------+      | Weibull AEP      |      | IecSiteReport    |
                         | Gumbel extremes  |      | FinancialResult  |
                         | turbulence (IEC) |      | TurbineLayout    |
                         | terrain speed-up |      | ConstraintReport |
                         | viewshed (ZTV)   |      | CumulativeImpact |
                         | financial NPV    |      | (all stream      |
                         +------------------+      |  through React UI|
                                                   |  + PDF export)   |
                                                   +------------------+
```

### Scoring factors (composite 0-100)

| Factor                  | Default weight | Source            | Score driver |
|-------------------------|---------------:|-------------------|--------------|
| Wind resource           | 0.35           | NASA POWER        | Hub-height speed (extrapolated), CV, directional consistency |
| Terrain suitability     | 0.20           | Open-Elevation    | Slope %, elevation, roughness class |
| Grid proximity          | 0.15           | OSM Overpass      | Distance to nearest substation (60%) and 100 kV+ line (40%) |
| Land-use compatibility  | 0.15           | OSM Overpass      | Hard exclusions, soft setbacks, positive indicators |
| Planning feasibility    | 0.10           | Nominatim + OSM   | Country framework, nearby precedents, density proxy |
| Access logistics        | 0.05           | OSM Overpass      | Best road category within 5 km |

Hard constraints (any factor < 20) are surfaced regardless of composite score. Weights normalise to 1.0 automatically.

### Wind-shear extrapolation

Power-law profile is applied with reference height `h_ref` = 50 m when NASA POWER `WS50M` is non-zero, otherwise 2 m:

$$ v_{hub} = v_{ref}\left(\frac{h_{hub}}{h_{ref}}\right)^{\alpha} $$

`alpha` is derived from terrain roughness class (0.10 offshore -> 0.35 urban), not hardcoded.

---

## 3. File-by-file reference

Every TypeScript file under `packages/core/src` and `packages/ui/src`. One line summary, then key exports.

### 3.1 `packages/core/src` - root

| File | Role |
|------|------|
| `index.ts` | Public API surface: re-exports types and functions. Keeps the package's import boundary explicit. |
| `cli.ts` | Command-line analyser. `npx tsx packages/core/src/cli.ts <lat> <lng> [--hub-height N]`. Pretty-prints score, factor breakdown, hard constraints, and source health. |

### 3.2 `analysis/` - derived statistics from raw wind history

| File | What it does |
|------|---------------|
| `wind-analysis.ts` | Pure functions: `computeWindTrend` (linear regression + R^2), `computeSeasonalHeatmap` (month x hour grid), `computeMonthlyBoxPlots` (Tukey IQR + outliers), `computeDiurnalProfile`, `computeSpeedDistribution` (Weibull k/c MoM fit), `computeYearOverYear`. |
| `turbulence.ts` | IEC 61400-1 turbulence intensity: bins by wind speed, computes mean and representative TI at 15 m/s, classifies A/B/C/exceeds_A. |
| `extreme-wind.ts` | Gumbel Type-I fit (`fitGumbel`, `gumbelQuantile`) for 1-, 50-, 100-year return periods; assigns IEC wind class I/II/III/S. |
| `data-quality.ts` | Scores wind history completeness, gap length, and recency. |
| `mcp-analysis.ts` | Measure-Correlate-Predict: linear regression between short on-site mast and long-term reanalysis. |
| `index.ts` | Barrel export for the `analysis` subpackage. |

### 3.3 `cache/` - request and tile caches

| File | What it does |
|------|---------------|
| `index.ts` | Generic in-memory TTL cache used by every data-source client. |
| `spatial-cache.ts` | Geohash-keyed tile cache for elevation grids and Overpass responses to avoid duplicate fetches when sampling a polygon. |

### 3.4 `constraints/` - hard/soft/info constraint engine

| File | What it does |
|------|---------------|
| `constraint-definitions.ts` | 19 ConstraintDefinition records across environmental, aviation, military, heritage, residential, infrastructure, water, terrain. Each with severity, default setback metres, and human description. |
| `constraint-queries.ts` | Single batched Overpass query builder for a site's bounding box (expanded by max setback). 24 h cache, 30 s timeout, 1 retry after 5 s. |
| `constraint-detector.ts` | Walks Overpass elements, classifies each, computes distance to site polygon edge, builds `SiteConstraintReport` with hard / soft / info lists, nearest-receptor table, exclusion zones, and recommendation enum. |
| `exclusion-geometry.ts` | Buffers each hard constraint by its setback, intersects with site polygon, returns `ExclusionZone[]` with overlap area. |
| `index.ts` | Barrel export. |

### 3.5 `cumulative/` - combined existing + proposed impact

| File | What it does |
|------|---------------|
| `cumulative-impact.ts` | `assessCumulativeImpact(proposed, existing, receptors, options)` -> noise (proposed only and combined), shadow flicker, optional viewshed. **Now uses dynamic ID offset to prevent collisions.** |
| `index.ts` | Barrel export. |

### 3.6 `datasources/` - external API clients

All clients implement: retry with exponential backoff, abort signal support, in-memory TTL cache, structured `Result<T, ScoringError>` returns.

| File | API | What it returns |
|------|-----|-----------------|
| `nasa-power.ts` | NASA POWER (RE community) | `WindDataSummary` for fast scoring; `MonthlyWindHistory` (1981-present), `DailyWindData`, `HourlyWindData` for charts. Multi-height: WS2M / WS10M / WS50M / WD10M / WD50M. |
| `open-elevation.ts` | Open-Elevation (SRTM 30 m) | `ElevationData`: elevation, slope %, aspect, roughness class. Samples a 9-point grid and fits gradient. |
| `osm-overpass.ts` | OSM Overpass API | Grid infrastructure (lines >= 100 kV via `GRID_VOLTAGE_REGEX`, substations), land use, road access, nearby wind farms. Each cached 24 h. |
| `nominatim.ts` | OSM Nominatim | Reverse geocoding for country/region context. 1 req/s rate limited, mandatory User-Agent. |
| `era5.ts` | ECMWF ERA5 (optional) | High-resolution (~31 km) reanalysis for higher-confidence wind data. |
| `cerra.ts` | Copernicus CERRA (optional) | European 5.5 km reanalysis. |
| `met-mast-parser.ts` | Local CSV | Parses on-site mast files for MCP correlation. |
| `index.ts` | Barrel export. |

### 3.7 `scoring/` - the 6-factor engine

| File | What it does |
|------|---------------|
| `engine.ts` | `analyseSite(options)`. Validates coordinate, normalises weights, fires all data sources in parallel via `Promise.allSettled`, hands each result to its factor scorer, assembles `SiteAnalysis`. Hard constraints (< 20) escalate. Records sources used / failed in metadata. |
| `wind-resource.ts` | Combines hub-height speed (60%), consistency CV (25%), directional stability (15%). Confidence from `dataYears`. |
| `terrain-suitability.ts` | Slope (50%), elevation (25%), roughness (25%). Slope >= 30% scores 0. |
| `grid-proximity.ts` | Substations weighted 60%, lines 40%. Distance bands 5/15/30/50 km. |
| `land-use.ts` | Hard constraints score 0 with `Constraint[]` raised. Soft de-duplicated by type so multiple residential polygons aren't penalised separately. Positive indicators boost. |
| `planning.ts` | Country list, precedent (existing wind farms within 20 km), density proxy. Always low/medium confidence; explicitly disclaims formal assessment. |
| `access.ts` | Best road category and distance. Primary <= 2 km -> 80-100; no roads -> hard constraint. |
| `index.ts` | Barrel + `DEFAULT_WEIGHTS` and `normaliseWeights`. |

### 3.8 `wake/` - directional wake-loss models

| File | What it does |
|------|---------------|
| `jensen-wake.ts` | Jensen (1983) top-hat wake. Includes thrust-curve generation from power curve via actuator-disc theory and Newton solve of $C_p = 4a(1-a)^2$. Wake-rotor circle overlap by analytical area intersection. RSS / Katic superposition. |
| `bastankhah-wake.ts` | Gaussian wake (Bastankhah & Porte-Agel, 2014) with $\sigma_y = k^* x + \epsilon d$ near-wake correction. |
| `wake-loss-calculator.ts` | `calculateDirectionalWakeLoss(layout, turbine, windData, model)` integrates the 36-sector wind rose, runs the chosen wake model per sector, weights by sector frequency, returns sector + total wake loss %. |
| `index.ts` | Barrel. |

### 3.9 `energy/` - AEP, layout

| File | What it does |
|------|---------------|
| `aep-calculator.ts` | Weibull-based annual energy production with power-curve integration, air-density correction (lapse rate from elevation), 7-item loss stack (wake, electrical, availability, environmental, icing, hysteresis, curtailment), P50 / P75 / P90 (z = 0 / 0.674 / 1.282 on log-normal uncertainty). 12-month seasonal split. |
| `layout-optimiser.ts` | Greedy hill-climb layout. Respects spacing rules (3D crosswind, 5D downwind), site polygon, exclusion zones. Optimises directional AEP through wake model. |
| `turbine-layout.ts` | Helpers: grid layout, edge layout, validate spacing. |
| `index.ts` | Barrel. |

### 3.10 `financial/` - economics

| File | What it does |
|------|---------------|
| `financial-model.ts` | LCOE, NPV, simple + discounted payback, IRR via Newton-Raphson. 25-year cashflow with degradation, opex, capex, decommissioning. |
| `scenario-analysis.ts` | Sensitivity analysis: tornado diagram-style deltas for capex / opex / wind / price. |
| `index.ts` | Barrel. |

### 3.11 `noise/` - acoustics

| File | What it does |
|------|---------------|
| `noise-propagation.ts` | ISO 9613-2 implementation: geometric divergence, atmospheric absorption (frequency-dependent table), ground effect (G-factor), barrier screening. |
| `etsu-assessment.ts` | UK ETSU-R-97 compliance: 35-43 dB(A) day, 43 dB(A) night, plus 5 dB amenity above background; relaxed to 45 dB at financially-involved receptors. |
| `noise-contours.ts` | Generates iso-noise contour polygons by sampling a grid then marching-squares. |
| `index.ts` | Barrel. |

### 3.12 `shadow/` - flicker

| File | What it does |
|------|---------------|
| `solar-position.ts` | Meeus astronomical algorithm: solar azimuth + elevation per UTC datetime + lat/lng. |
| `shadow-flicker.ts` | Hour-by-hour annual simulation. For each hour with sun above 1°, checks each turbine's shadow geometry vs each receptor (rotor angular width, shadow length, distance cap). Returns hours/year per receptor. |
| `shadow-calendar.ts` | Month x hour matrix of flicker days for mitigation scheduling (e.g. shutdown windows). |
| `index.ts` | Barrel. |

### 3.13 `terrain/` - topographic effects

| File | What it does |
|------|---------------|
| `elevation-grid.ts` | Builds dense `ElevationGrid` from Open-Elevation tiles. |
| `terrain-speedup.ts` | Jackson-Hunt linearised speed-up over hills. Identifies ridge orientation, returns speed-up factor and effective wind multiplier. |
| `rix-calculator.ts` | RIX (Ruggedness Index): % of terrain exceeding 30% slope within a radius. RIX > 5% indicates non-trivial flow distortion; > 30% triggers warnings. |
| `index.ts` | Barrel. |

### 3.14 `turbines/` - model library

| File | What it does |
|------|---------------|
| `turbine-library.ts` | 12+ built-in models from 660 kW (Vestas V47) to 8 MW (Siemens Gamesa SG 8.0-167) with rated power, rotor diameter, hub-height options, full power curves, sound power level. |
| `power-curve-parser.ts` | CSV import for custom turbines; validates monotonic wind speed, plausible Cp. |
| `index.ts` | Barrel + `getAllTurbines`, `getTurbineById`. |

### 3.15 `site/` - polygon-based assessment

| File | What it does |
|------|---------------|
| `site-boundary.ts` | `createBoundary(polygon, name?)`, `parseBoundaryFromGeoJSON`, `parseBoundaryFromKML`. Computes centroid, area (spherical excess), bounding box. |
| `site-assessment.ts` | Top-level `assessSite(boundary, options)`: samples grid points inside polygon, scores each, aggregates factors, runs constraint detector, optionally calculates AEP for a chosen turbine. |
| `index.ts` | Barrel. |

### 3.16 `visual/` - viewshed

| File | What it does |
|------|---------------|
| `viewshed.ts` | Zone of Theoretical Visibility. Bilinear elevation sampling + line-of-sight checks with earth-curvature drop $d^2 / (2R)$. |

### 3.17 `reporting/` - structured outputs

| File | What it does |
|------|---------------|
| `iec-report.ts` | Builds `IecSiteReport` aligned with IEC 61400-1 Ed.4 + 61400-12-1 Ed.2: wind conditions, turbulence class, extreme wind class, energy summary, suitability recommendation. Pure data structure (rendered by UI / PDF). |

### 3.18 `validation/`

| File | What it does |
|------|---------------|
| `data-validator.ts` | Cross-checks: speed range plausibility, missing-month detection, direction sanity, height consistency. |

### 3.19 `utils/`

| File | What it does |
|------|---------------|
| `geo.ts` | Haversine `distanceKm`, `clamp`, `linearScale`, `isValidCoordinate`. |
| `geometry.ts` | Polygon area (spherical excess), point-in-polygon (ray casting), edge distance, circle buffer, polygon overlap area. |
| `wind-shear.ts` | `extrapolateWindSpeed`, `roughnessClassToAlpha`, `REFERENCE_HEIGHT_M`. |
| `cache.ts` | Re-export of `cache/index.ts`. |
| `fetch.ts` | Shared retry + abort wrapper around `fetch`. |
| `elevation-profile.ts` | Samples elevation along a great-circle arc. |

### 3.20 `types/` - shared interfaces and discriminated unions

`analysis.ts`, `constraints.ts`, `datasources.ts`, `energy.ts`, `errors.ts`, `financial.ts`, `met-mast.ts`, `noise.ts`, `result.ts`, `shadow.ts`, `site.ts`, `terrain.ts`, `turbines.ts`, `wake.ts`, `wind-assessment.ts`. All branded; `Result<T, E>` is the canonical error channel.

---

## 4. UI components (`packages/ui/src`)

All components: named-export, accept `className` and `theme`, render loading & error states, no direct API calls (data flows through `core` via hooks).

| Component | Purpose |
|-----------|---------|
| `WindSiteScorer.tsx` | Drop-in widget: map + coord inputs + score card + sliders + export. |
| `SiteMap.tsx` | Leaflet map with click-to-analyse, animated loading pin, optional heatmap overlay, debounced bounds-change emitter. **Memory-leak in `BoundsWatcher` fixed in this pass.** |
| `ScoreCard.tsx` | Composite score circle, hard-constraint banner, per-factor bars, optional Wind Rose. |
| `WeightSliders.tsx` | Six sliders, live re-normalisation, sum indicator. |
| `WindRose.tsx` | 16-point compass radar built on Recharts. Helpers: `degreesToCompass`, `emptyRoseData`, `DEFAULT_WIND_BANDS`. |
| `WindTrendChart.tsx` | Monthly speed line + linear-regression trend overlay; shows slope per year and R². |
| `SeasonalHeatmap.tsx` | SVG month x hour grid, blue->green->red colour scale, integrated legend. |
| `MonthlyBoxPlot.tsx` | Recharts ComposedChart with custom box & whisker (IQR bar + ErrorBar whiskers + median/mean lines). |
| `DiurnalProfile.tsx` | Hourly area chart with min/max band and mean line. |
| `WindSpeedDistribution.tsx` | Histogram + Weibull curve overlay. **Hooks-order bug fixed in this pass.** |
| `ScenarioCompare.tsx` | Up to 4 sites side-by-side; highlights best per factor and overall winner. |
| `SiteBoundaryEditor.tsx` | Click-to-add polygon vertices, manual coord entry, GeoJSON / KML upload. |
| `ConstraintPanel.tsx` | Severity-coloured constraint groups, recommendation badge, nearest-receptor table. |
| `ConstraintMap.tsx` | SVG aspect-corrected mini-map of boundary, exclusion zones, clustered constraint pins. |
| `EnergyYieldCard.tsx` | Gross/net AEP, capacity factor, P50/P75/P90, monthly production, assumptions. |
| `LossStackChart.tsx` | Horizontal stacked bar of the 7-item loss stack. |
| `TurbineSelector.tsx` | Grouped picker by power class. |
| `SiteAssessmentView.tsx` | Top-level layout for a full polygon assessment. |
| `ExportButton.tsx` | Lazy-loads jsPDF + html2canvas; renders a structured PDF including chart screenshots. |

### Hooks

| Hook | Role |
|------|------|
| `use-wind-data.ts` | Imperative `fetch(coordinate)` returning `WindDataSummary`. |
| `use-site-score.ts` | `analyse(options)` with abort-controller-backed cancellation; ignores stale results when superseded. |
| `use-map-interaction.ts` | Selected coord + animated map pin state. |

### Styles

`styles/theme.ts` defines the `WindSiteTheme` token set; all components consume CSS custom properties (`--wsi-primary`, `--wsi-text`, etc.) so consumers can override without rebuilding.

---

## 5. Test inventory (38 core suites, 1 UI suite, 702 total)

```
tests/access.test.ts                  16  | tests/met-mast.test.ts              20
tests/aep-calculator.test.ts          30  | tests/nasa-power-extended.test.ts   12
tests/cache.test.ts                    6  | tests/noise-model.test.ts           49
tests/cerra.test.ts                    9  | tests/nominatim.test.ts              9
tests/constraint-definitions.test.ts   9  | tests/osm-overpass.test.ts          25
tests/constraint-detector.test.ts     12  | tests/planning.test.ts              18
tests/cumulative-impact.test.ts        7  | tests/result.test.ts                 3
tests/data-validator.test.ts          19  | tests/shadow-flicker.test.ts        39
tests/engine.test.ts                  11  | tests/site-boundary.test.ts         13
tests/era5.test.ts                     8  | tests/spatial-cache.test.ts         12
tests/financial-model.test.ts         26  | tests/terrain-flow.test.ts          18
tests/geometry.test.ts                31  | tests/terrain-suitability.test.ts    9
tests/grid-proximity.test.ts          15  | tests/turbine-layout.test.ts         8
tests/iec-report.test.ts               8  | tests/turbine-library.test.ts       16
tests/land-use.test.ts                23  | tests/utils.test.ts                 21
tests/layout-optimiser.test.ts        12  | tests/viewshed.test.ts              11
tests/wake-model.test.ts              46  | tests/wind-analysis.test.ts         36
tests/wind-assessment.test.ts         23  | tests/wind-resource.test.ts         11
tests/wind-rose.test.ts               25  | tests/wind-shear.test.ts            12
ui/tests/chart-components.test.ts     24  |
                              total  =  702
```

---

## 6. Public API consumption modes

### 6.1 Drop-in widget

```tsx
import { WindSiteScorer } from '@jamieblair/windforge';

<WindSiteScorer defaultCenter={{ lat: 55.86, lng: -4.25 }} hubHeightM={100} />
```

### 6.2 Headless SDK

```ts
import { analyseSite, calculateAep, getTurbineById } from '@jamieblair/windforge-core';

const a = await analyseSite({ coordinate: { lat: 55.86, lng: -4.25 }, hubHeightM: 100 });
const aep = calculateAep(windData, getTurbineById('vestas-v110-2000')!);
```

### 6.3 Site (polygon) assessment

```ts
import { createBoundary, assessSite } from '@jamieblair/windforge-core';
const boundary = createBoundary([...polygon], 'My Site');
const assessment = await assessSite(boundary, { hubHeightM: 100 });
```

### 6.4 CLI

```
npx tsx packages/core/src/cli.ts 55.86 -4.25 --hub-height 100
```

---

## 7. Architectural invariants (preserved across this pass)

- Core has zero dependencies on React, DOM, or Node-only built-ins beyond `fetch` and `setTimeout`.
- UI never calls a remote API directly; all data flows through hooks that go through core.
- Errors travel via `Result<T, ScoringError>`; thrown exceptions only for programmer errors.
- No `any`, no default exports, no barrel re-exports beyond package entry points.
- Numbers carry units in their variable names (`distanceKm`, `speedMs`, `elevationM`, `hubHeightM`).
- Every scoring function returns a `confidence: 'high' | 'medium' | 'low'` plus a human `detail` string.
- `Promise.allSettled` for fan-out so any single failed source degrades to neutral with low confidence rather than killing the analysis.

---

## 8. Suggested next extensions (for the next AI to work on)

These are gaps observed during the audit, ranked by leverage.

1. **Bias-correct NASA POWER against ERA5 / CERRA when both are present.** The clients exist; a small reconciliation layer in `analysis/` would lift wind-resource confidence to `high` for European sites.
2. **Cumulative wake from existing wind farms.** `cumulative-impact.ts` already merges turbine lists for noise + flicker; extend to `calculateDirectionalWakeLoss` so AEP estimates account for upstream existing wakes.
3. **Tile-based `SiteMap` heatmap pre-fetch.** The `BoundsWatcher` now emits bounds reliably (post-fix); a worker-side coarse-grid scorer could populate heatmap points without blocking interactions.
4. **MCP server wrapper (`packages/mcp/`).** Expose `analyseSite`, `assessSite`, `fetchMonthlyWindHistory`, `calculateAep` as MCP tools so any LLM can call them. Stdio transport, no auth.
5. **Persistent cache adapter.** Current `cache/index.ts` is in-memory only. An optional IndexedDB / SQLite adapter would survive page reloads and CLI invocations.
6. **Offshore-mode terrain scoring.** `roughnessClass=0` already returns 85; add bathymetry source (GEBCO) and update `terrain-suitability.ts` to score water depth instead of slope.
7. **Sector management for noise / shadow.** Where ETSU or shadow limits would otherwise fail, suggest curtailment sector schedules using `shadow-calendar.ts` matrices and noise direction-of-arrival.
8. **Battery + grid-firming module under `financial/`.** Pair AEP P50/P90 spread with optional storage sizing for capacity-firming LCOE.

---

## 9. Glossary (selected)

| Term | Meaning |
|------|---------|
| AEP | Annual Energy Production (MWh/year). |
| Capacity factor | AEP / (rated power x 8760 h). |
| Cp / Ct | Power coefficient / thrust coefficient. |
| ETSU-R-97 | UK noise guidance for wind farms. |
| Gumbel | Type-I extreme value distribution used for return-period winds. |
| IEC 61400 | International standard family for wind turbine generator systems. |
| LCOE | Levelised cost of energy. |
| MCP | Measure-Correlate-Predict. |
| P50 / P75 / P90 | AEP exceedance probabilities (50%, 75%, 90%). |
| RIX | Ruggedness index (% of area > 30% slope). |
| Weibull | Two-parameter speed distribution (`k`, `c`). |
| ZTV | Zone of Theoretical Visibility. |

---

*End of specification. Generated for use as a single-document briefing for AI agents and engineers extending WindForge.*
