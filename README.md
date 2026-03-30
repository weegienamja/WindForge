```
 __        __ _             _  _____
 \ \      / /(_) _ __    __| ||  ___|___   _ __  __ _   ___
  \ \ /\ / / | || '_ \  / _` || |_  / _ \ | '__|/ _` | / _ \
   \ V  V /  | || | | || (_| ||  _|| (_) || |  | (_| ||  __/
    \_/\_/   |_||_| |_| \__,_||_|   \___/ |_|   \__, | \___|
                                                 |___/
```

# WindForge

[![CI](https://github.com/weegienamja/WindForge/actions/workflows/ci.yml/badge.svg)](https://github.com/weegienamja/WindForge/actions)
[![MIT Licence](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENCE)
[![Tests](https://img.shields.io/badge/tests-678%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)]()

**A professional-grade wind turbine site assessment toolkit.** WindForge combines meteorological data, terrain analysis, environmental modelling, and financial forecasting into one open-source platform. It helps engineers and developers make better decisions about where to place wind turbines, backed by real data and transparent scoring.

This is not a black box. Every score comes with a plain-English explanation. Every model is inspectable. Humans always make the final call.

---

## What Can It Do?

WindForge started as a simple site scorer and has grown into a comprehensive assessment platform. Here is a birds-eye view of the full capability set:

```
+------------------------------------------------------------------+
|                        WINDFORGE PLATFORM                        |
+------------------------------------------------------------------+
|                                                                  |
|  DATA LAYER          ANALYSIS LAYER          OUTPUT LAYER        |
|  ~~~~~~~~~~~~        ~~~~~~~~~~~~~~          ~~~~~~~~~~~~        |
|                                                                  |
|  NASA POWER -------> Site Scoring ---------> Score Cards         |
|  (wind @ 2/10/50m)  (6 weighted factors)    (per-factor detail)  |
|                                                                  |
|  Open-Elevation ---> Wind Analysis --------> Charts & Graphs     |
|  (terrain/slope)    (trends, seasonal,      (12+ interactive     |
|                      diurnal, Weibull)       React components)   |
|                                                                  |
|  OSM Overpass -----> Noise Modelling ------> PDF Reports         |
|  (grid, land use,   (ISO 9613-2, ETSU)     (full assessment)     |
|   roads, turbines)                                               |
|                                                                  |
|  Nominatim --------> Shadow Flicker -------> CLI Output          |
|  (reverse geocode)  (solar ephemeris)       (terminal analysis)  |
|                                                                  |
|  ERA5 / CERRA -----> Wake Modelling -------> IEC Reports         |
|  (optional, high-   (Jensen, Bastankhah)    (61400-1 compliant)  |
|   resolution)                                                    |
|                                                                  |
|                      Terrain Flow ---------> Comparison View     |
|                      (speed-up, RIX)        (multi-site)         |
|                                                                  |
|                      Financial Model ------> Energy Yield        |
|                      (LCOE, IRR, payback)   (AEP, P50/75/90)     |
|                                                                  |
|                      Layout Optimiser                            |
|                      (hill-climbing AEP)                         |
|                                                                  |
|                      Viewshed Analysis                           |
|                      (zone of visibility)                        |
|                                                                  |
|                      Cumulative Impact                           |
|                      (existing + proposed)                       |
|                                                                  |
|                      Turbulence / Extreme                        |
|                      Wind Assessment                             |
|                                                                  |
|                      On-Site Data (MCP)                          |
|                      (met mast correlation)                      |
|                                                                  |
+------------------------------------------------------------------+
```

### Feature Highlights

| Category | What You Get |
|----------|-------------|
| **Site Scoring** | 6-factor weighted engine (wind, terrain, grid, land use, planning, access) with hard constraint detection |
| **Wind Analysis** | 44 years of NASA POWER data, trend analysis, seasonal heatmaps, diurnal profiles, Weibull distribution fitting |
| **Noise Modelling** | ISO 9613-2 propagation with atmospheric absorption, ground effect, barrier screening. ETSU-R-97 compliance checks. Noise contour mapping |
| **Shadow Flicker** | Full solar ephemeris (Meeus algorithm), per-receptor annual shadow hours, monthly calendars, compliance assessment |
| **Wake Modelling** | Jensen (top-hat) and Bastankhah (Gaussian) models. Directional wake loss with 36-sector wind rose integration |
| **Terrain Flow** | Jackson-Hunt speed-up estimation, RIX (ruggedness index) calculation, elevation grid analysis |
| **Energy Yield** | Weibull-based AEP with power curve integration, air density correction, 7-category loss stack, P50/P75/P90 confidence |
| **Financial** | LCOE, IRR (Newton-Raphson), simple/discounted payback, 25-year cashflow projections, sensitivity analysis |
| **Layout Optimisation** | Greedy hill-climbing to maximise AEP while respecting spacing, boundary, and exclusion constraints |
| **Visual Impact** | Zone of Theoretical Visibility (ZTV) with earth curvature correction and terrain screening |
| **Cumulative Impact** | Combined noise, shadow, and visibility from proposed and existing turbines at shared receptors |
| **Turbulence** | IEC 61400-1 turbulence classification, representative TI at 15 m/s, site-specific estimation |
| **Extreme Wind** | Gumbel Type I extreme value analysis for 50-year and 100-year return periods |
| **On-Site Data** | Met mast CSV parsing, MCP (Measure-Correlate-Predict) analysis, automated data quality assessment |
| **IEC Reporting** | IEC 61400-1 aligned site conditions summary with wind class, turbulence, extreme wind, and suitability assessment |
| **Data Infrastructure** | Optional ERA5/CERRA reanalysis sources, spatial tile caching, boundary validation pipeline |
| **Constraints** | 19+ definitions across 8 categories (environmental, aviation, military, heritage, residential, infrastructure, water, terrain) |
| **Turbine Library** | 12+ models from 660 kW to 8 MW with power curves, thrust coefficients, and sound power levels. CSV import for custom turbines |
| **678 tests** | Comprehensive coverage across 38 test files. Every scoring function, every model, every edge case |

---

## Quick Start

### Drop-in React Widget

The fastest way to get started. Drop this into any React app and you've got a fully interactive wind site analyser:

```tsx
import { WindSiteScorer } from '@jamieblair/windforge';

<WindSiteScorer
  defaultCenter={{ lat: 55.86, lng: -4.25 }}
  defaultZoom={8}
  hubHeightM={100}
  weights={{ windResource: 0.4, terrainSuitability: 0.2 }}
  theme={{ primary: '#0f172a', accent: '#22c55e' }}
  onAnalysisComplete={(analysis) => console.log(analysis)}
/>
```

### Headless SDK

Use the core engine directly without any UI. Works in Node.js, Deno, Bun, or the browser:

```typescript
import { analyseSite } from '@jamieblair/windforge-core';

const analysis = await analyseSite({
  coordinate: { lat: 55.86, lng: -4.25 },
  hubHeightM: 100,
});

if (analysis.ok) {
  console.log(`Score: ${analysis.value.compositeScore}/100`);
  for (const factor of analysis.value.factors) {
    console.log(`  ${factor.factor}: ${factor.score}/100 (${factor.detail})`);
  }
}
```

### Site Boundary Assessment

Define a site boundary and get a full parcel assessment with constraint detection:

```typescript
import { createBoundary, assessSite } from '@jamieblair/windforge-core';

const boundary = createBoundary([
  { lat: 55.87, lng: -4.30 },
  { lat: 55.87, lng: -4.20 },
  { lat: 55.85, lng: -4.20 },
  { lat: 55.85, lng: -4.30 },
], 'Glasgow West');

const assessment = await assessSite(boundary, { hubHeightM: 100 });
```

### Energy Yield

Pick a turbine from the built-in library and estimate annual energy production:

```typescript
import { calculateAep, getTurbineById } from '@jamieblair/windforge-core';

const turbine = getTurbineById('vestas-v110-2000');
const result = await calculateAep(windData, turbine, { hubHeightM: 100 });

console.log(`Net AEP: ${result.value.netAepMwh.toFixed(0)} MWh`);
console.log(`Capacity Factor: ${(result.value.capacityFactorNet * 100).toFixed(1)}%`);
```

### Noise Assessment

Check whether a proposed layout meets ETSU-R-97 noise limits:

```typescript
import { calculateNoiseAtReceptor, assessNoiseCompliance } from '@jamieblair/windforge-core';

const noise = calculateNoiseAtReceptor(turbinePositions, receptorLocation, soundPowerLevels, hubHeightM);
const compliance = assessNoiseCompliance(receptors, noiseResults, { isQuietArea: false });
```

### CLI

Analyse any location from the terminal:

```bash
npx tsx packages/core/src/cli.ts 55.86 -4.25
npx tsx packages/core/src/cli.ts 58.21 -5.03 --hub-height 100
```

---

## How It Works

WindForge is built as a monorepo with a strict separation between the data engine and the UI layer. The core package is pure TypeScript with zero framework dependencies. The UI package wraps it in React components.

```
                    +-------------------+
                    |    Your App       |
                    +-------------------+
                            |
              +-------------+-------------+
              |                           |
     +--------v--------+         +--------v--------+
     |   @windforge     |        | @windforge-core  |
     |   (React UI)     |------->|  (Pure TS)       |
     |                  |        |                  |
     | - 19 Components  |        | - Scoring Engine |
     | - 3 Hooks        |        | - 15 Analysis    |
     | - PDF Export     |        |   Modules        |
     | - Theming        |        | - 6 Data Sources |
     +------------------+        | - 12+ Turbines   |
                                 +------------------+
                                         |
                    +--------------------+--------------------+
                    |                    |                    |
              +-----v-----+     +-------v-------+    +------v------+
              | NASA POWER |     | OSM Overpass  |    | Open-Elev.  |
              | (wind data)|     | (infra, land) |    | (terrain)   |
              +------------+     +---------------+    +-------------+
```

### Package Structure

```
windforge/
  packages/
    core/        Pure TypeScript, no React, runs anywhere
    ui/          React 18+ components consuming core
    demo/        Next.js 15 app for development and showcase
  docs/          API reference, component docs, architecture guide
```

| Package | Description |
|---------|-------------|
| `@jamieblair/windforge-core` | Scoring engine, analysis modules, data source clients, turbine library, all TypeScript types |
| `@jamieblair/windforge` | 19 React components, 3 hooks, PDF export, theming system |

---

## Scoring Engine

The scoring engine is the foundation. It takes a coordinate and returns a composite suitability score with per-factor breakdowns.

### How Scoring Works

```
  Coordinate (lat, lng)
         |
         v
  +------+------+------+------+------+------+
  |      |      |      |      |      |      |
  v      v      v      v      v      v      v
 Wind  Terrain  Grid   Land  Planning Access
 0.35   0.20   0.15   0.15   0.10    0.05   <-- weights (adjustable)
  |      |      |      |      |      |
  v      v      v      v      v      v
 85/100 72/100 63/100 90/100 55/100 78/100  <-- factor scores
  |      |      |      |      |      |
  +------+------+------+------+------+
                    |
                    v
            Composite: 77/100
            Hard constraints: none
            Confidence: high
```

Each factor fetches its own data in parallel, scores independently (0-100), and contributes to the weighted composite. If any factor scores below 20, it triggers a hard constraint flag that gets surfaced prominently regardless of the overall score.

The engine never says "build here" or "don't build here." It presents the numbers, explains the reasoning, and lets the human decide.

### Scoring Factors

| Factor | Weight | Data Source | What It Measures |
|--------|--------|-------------|-----------------|
| Wind Resource | 0.35 | NASA POWER | Wind speed at multiple heights, consistency, directional stability, extrapolated to hub height |
| Terrain Suitability | 0.20 | Open-Elevation | Elevation, slope gradient, aspect, surface roughness |
| Grid Proximity | 0.15 | OSM Overpass | Distance to 132kV+ transmission lines and substations |
| Land Use Compatibility | 0.15 | OSM Overpass | Protected areas, residential buffers, farmland, forests |
| Planning Feasibility | 0.10 | Nominatim + Overpass | Nearby existing wind farms, population density, regional context |
| Access Logistics | 0.05 | OSM Overpass | Road network quality within 5km |

### Wind Shear Extrapolation

NASA POWER gives wind speed at 2m, 10m, and 50m above ground. Real turbines operate at 80-120m. WindForge bridges that gap using the power law wind profile:

```
v_hub = v_ref x (h_hub / h_ref) ^ alpha
```

It prefers the 50m measurement as the reference height (much more accurate than extrapolating from 2m). The shear exponent (alpha) is derived from the terrain roughness class, not hardcoded. The output shows speeds at every measured height plus the extrapolated value, so you can see exactly how the estimate was built.

### Constraint System

19+ constraint definitions across 8 categories:

| Category | Examples | Impact |
|----------|----------|--------|
| Environmental | Nature reserves, SSSI, SAC, SPA | Blocks development |
| Aviation | Airports (5km buffer), helipads (2km) | Blocks development |
| Military | Military land | Blocks development |
| Heritage | Listed buildings (1km buffer) | Reduces score |
| Residential | Dwellings (500m-1km depending on turbine size) | Reduces score |
| Infrastructure | Power lines, railways | Reduces score |
| Water | Rivers, lakes, coastal zones | Reduces score |
| Terrain | Slopes steeper than 25% | Reduces score |

---

## Analysis Modules

Beyond scoring, WindForge includes a full suite of professional analysis tools. Each module is a pure function: data goes in, results come out, no side effects.

### Noise Modelling (ISO 9613-2 + ETSU-R-97)

Predicts sound pressure levels at receptor locations using the ISO 9613-2 simplified propagation model with atmospheric absorption, ground effect, and terrain barrier attenuation. Multi-turbine contributions are summed logarithmically. Includes ETSU-R-97 compliance checking with daytime/nighttime limits and quiet area adjustments. Can generate noise contour grids for mapping.

### Shadow Flicker

Full solar ephemeris using the Meeus astronomical algorithm calculates sun position for every daylight hour of the year. Determines when each turbine casts a flickering shadow on nearby receptors based on rotor geometry, sun angle, and distance. Outputs annual shadow hours per receptor, monthly calendars, and compliance assessment against typical 30 hours/year limits.

### Wake Modelling

Two industry-standard wake models:
- **Jensen (Park):** Classic top-hat deficit profile with linear wake expansion. Fast, conservative.
- **Bastankhah (Gaussian):** More realistic bell-shaped deficit. Better accuracy for close spacing.

Both integrate across a 36-sector wind rose to compute directional wake losses, accounting for partial wake overlap and turbine-by-turbine deficit stacking.

### Energy Yield

Fits a Weibull distribution to the wind regime at hub height, then integrates the turbine power curve against the Weibull PDF. Applies air density correction for elevation. Stacks 7 loss categories (wake, electrical, availability, environmental, icing, hysteresis, curtailment). Reports gross AEP, net AEP, capacity factor, and P50/P75/P90 confidence intervals based on interannual variability.

### Financial Modelling

Computes LCOE (levelised cost of energy), IRR (internal rate of return using Newton-Raphson with bisection fallback), simple and discounted payback periods, and full 25-year cashflow projections. Includes sensitivity analysis across key parameters (capex, wind speed, electricity price, discount rate).

### Layout Optimisation

Greedy hill-climbing algorithm that iteratively shifts turbine positions to maximise AEP while respecting minimum spacing constraints (configurable, default 3 rotor diameters), site boundary limits, and exclusion zones. Starts from a rectangular grid layout and reports convergence history.

### Terrain Flow

Simplified Jackson-Hunt terrain speed-up estimation using elevation gradients. Computes RIX (Ruggedness Index) for terrain complexity assessment. Builds elevation grids from sampled points for use by other modules (viewshed, noise barrier screening).

### Visual Impact (Viewshed)

Zone of Theoretical Visibility calculation with earth curvature correction. For each sample point in a grid, traces line-of-sight to each turbine tip, accounting for intervening terrain. Reports visibility percentage, maximum visibility distance, and per-cell turbine counts.

### Cumulative Impact

Merges proposed turbines with known existing turbines and computes combined noise, shadow flicker, and viewshed at shared receptor locations. Lets you see the total environmental burden, not just your project's contribution.

### Turbulence and Extreme Wind

Estimates turbulence intensity and classifies sites against IEC 61400-1 categories (A, B, C). Calculates extreme wind speeds for 50-year and 100-year return periods using Gumbel Type I extreme value analysis.

### On-Site Data Integration (MCP)

Parses met mast CSV data with configurable column mapping. Performs Measure-Correlate-Predict analysis to extend short on-site records using long-term reference data. Includes automated data quality assessment with gap detection, stuck sensor identification, and completeness reporting.

### IEC Reporting

Generates IEC 61400-1 aligned site conditions reports covering wind conditions, turbulence classification, extreme wind estimates, energy yield summary, and turbine suitability assessment.

---

## Data Sources

All default data comes from **free, publicly accessible APIs**. No paid keys required.

```
+--------------------------------------------------+
|            DATA SOURCE ARCHITECTURE              |
+--------------------------------------------------+
|                                                  |
|  DEFAULT (free, no key needed)                   |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~              |
|  NASA POWER -----> Wind speed/direction          |
|                    2m, 10m, 50m heights           |
|                    1981 to present                |
|                    Monthly / Daily / Hourly       |
|                                                  |
|  Open-Elevation -> Terrain elevation             |
|                    Slope, aspect, roughness       |
|                                                  |
|  OSM Overpass ---> Grid infrastructure           |
|                    Land use, roads, turbines      |
|                                                  |
|  OSM Nominatim --> Reverse geocoding             |
|                    Country, region context        |
|                                                  |
|  OPTIONAL (free registration, higher resolution) |
|  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~              |
|  ERA5 -----------> Global reanalysis, 31km       |
|                    100m + 10m wind, hourly        |
|                    (CDS API key required)         |
|                                                  |
|  CERRA ----------> European reanalysis, 5.5km    |
|                    High-res for European sites    |
|                    (CDS API key required)         |
|                                                  |
+--------------------------------------------------+
```

| Source | Resolution | Coverage | Rate Limits |
|--------|-----------|----------|-------------|
| NASA POWER | ~50km grid | Global, 1981-present | Throttles rapid requests. 1s spacing between calls |
| Open-Elevation | Varies (SRTM/ASTER) | Global | Free tier, occasional downtime |
| OSM Overpass | Contributed data | Global | 20s timeout, max 1 retry. Heavily rate-limited |
| OSM Nominatim | Contributed data | Global | Strict 1 req/s limit |
| ERA5 (optional) | 31km grid | Global, 1940-present | CDS API queue system |
| CERRA (optional) | 5.5km grid | Europe only, 1984-2021 | CDS API queue system |

### Resilience

Every data source has retry logic with exponential backoff and aggressive caching. If any single source fails or times out, the analysis still completes with a neutral score (50) and `confidence: 'low'` for that factor. The UI clearly shows which factors have real data and which are running on fallbacks.

See [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) for the full technical reference on endpoints, parameters, and caching strategies.

---

## Turbine Library

12+ built-in turbine models from major manufacturers, spanning 660 kW to 8 MW:

| Class | Models | Capacity | Rotor Diameter |
|-------|--------|----------|----------------|
| Small | Vestas V47-660, Enercon E-48 | 660-800 kW | 47-48m |
| Medium | Vestas V90-2000, V110-2000, Siemens SWT-2.3-93 | 2.0-2.3 MW | 90-110m |
| Large | Vestas V126-3450, GE 3.6-137 | 3.45-3.6 MW | 126-137m |
| Extra Large | Vestas V164-8000, Siemens SWT-8.0-154 | 8.0 MW | 154-164m |

Each model includes a full power curve, thrust coefficient curve, sound power levels (dBA), and key specifications (hub height, cut-in/cut-out speeds, rated speed). You can also import custom turbines from a CSV power curve file using `parsePowerCurveCSV()`.

---

## UI Components

19 React components for building wind assessment interfaces. Every component accepts `className` and `theme` props. Every component handles loading and error states.

### Core Components

| Component | What It Does |
|-----------|-------------|
| `<WindSiteScorer />` | Full orchestrator: map, inputs, weight sliders, score card, all wired together |
| `<SiteMap />` | Leaflet interactive map with click-to-analyse, pin markers, heatmap overlay |
| `<ScoreCard />` | Composite score display with per-factor bar breakdown and constraint flags |
| `<WeightSliders />` | Six range sliders for adjusting scoring weights in real time |
| `<ScenarioCompare />` | Side-by-side comparison of 2-4 sites with per-factor winner highlighting |
| `<ExportButton />` | PDF report generation with embedded chart images |

### Chart Components

| Component | What It Shows |
|-----------|-------------|
| `<WindRose />` | 16-point compass rose with wind direction frequency by speed band |
| `<WindTrendChart />` | Monthly wind speed from 1981-present with regression trend line |
| `<SeasonalHeatmap />` | Month x year heatmap colour-coded by wind speed |
| `<MonthlyBoxPlot />` | Box-and-whisker chart for monthly wind speed distributions |
| `<DiurnalProfile />` | 24-hour area chart showing mean/min/max wind speed by hour |
| `<WindSpeedDistribution />` | Frequency histogram with Weibull curve overlay |

### Site Assessment Components

| Component | What It Does |
|-----------|-------------|
| `<SiteBoundaryEditor />` | Polygon editor with lat/lng inputs, GeoJSON/KML import |
| `<ConstraintPanel />` | Tabular view of all detected constraints with severity badges |
| `<ConstraintMap />` | 2D SVG map of constraint locations relative to the site boundary |
| `<TurbineSelector />` | Grouped dropdown of turbine models with specs |
| `<EnergyYieldCard />` | AEP results: gross/net MWh, capacity factor, P50/P75/P90 |
| `<LossStackChart />` | Stacked horizontal bar showing all 7 loss categories |
| `<SiteAssessmentView />` | Full parcel assessment dashboard tying everything together |

See [docs/COMPONENTS.md](docs/COMPONENTS.md) for complete props tables and usage examples.

---

## Wind Analysis Functions

Pure functions that transform raw historical data into chart-ready output. No side effects, no API calls, trivially testable:

| Function | What It Computes |
|----------|-----------------|
| `computeWindTrend()` | Linear regression over monthly history, slope per decade, R-squared, trend direction |
| `computeSeasonalHeatmap()` | Year x month grid for spotting seasonal patterns and multi-year shifts |
| `computeMonthlyBoxPlots()` | Min/Q1/median/Q3/max/outliers for each calendar month across all years |
| `computeDiurnalProfile()` | 24-hour average/min/max curve with peak and trough hours |
| `computeSpeedDistribution()` | Frequency histogram with Weibull shape (k) and scale (c) parameters |
| `computeYearOverYear()` | Per-year comparison data for spotting long-term changes |

---

## Demo App

The demo is a Next.js 15 (App Router) application that shows off the full toolkit:

- **Quick Scan:** click anywhere on the Leaflet map to score a location instantly
- **Progressive loading:** scores appear first, then historical charts stream in as data arrives
- **Detailed analysis:** fetch daily (5 years) and hourly (1 year) data for deep dives
- **Site boundary editor:** draw or import parcel boundaries for full site assessment
- **Constraint detection:** visualise all environmental, aviation, and regulatory constraints
- **Turbine selection:** pick from 12+ models and estimate energy yield
- **PDF export:** generate a comprehensive downloadable report

---

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all 678 tests
pnpm test

# Development mode (demo app with hot reload)
pnpm dev

# Lint and format (Biome)
pnpm lint
pnpm format
```

### Tooling

| Tool | Job |
|------|-----|
| Turborepo | Workspace orchestration and build caching |
| pnpm | Fast, disk-efficient package management |
| TypeScript | Strict mode everywhere |
| Vitest | 678 tests across 38 test files |
| Biome | Linting and formatting (replaces ESLint + Prettier) |
| tsup | Bundling for npm (ESM + CJS + DTS) |

### Running Tests

```bash
# Everything
pnpm test

# Just the core engine
pnpm --filter @jamieblair/windforge-core test

# Just the UI components
pnpm --filter @jamieblair/windforge test
```

Test coverage spans scoring logic, all 15 analysis modules, data source clients, wind analysis, constraint detection, energy yield, geometry utilities, turbine library, wake models, noise propagation, shadow flicker, financial calculations, layout optimisation, viewshed, cumulative impact, IEC reporting, data validation, and UI component rendering.

---

## Documentation

| Document | What It Covers |
|----------|---------------|
| [docs/API.md](docs/API.md) | Full SDK reference: every exported function, type, and interface |
| [docs/COMPONENTS.md](docs/COMPONENTS.md) | All 19 UI components with props tables and usage examples |
| [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) | External API details: endpoints, parameters, rate limits, caching |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Package structure, data flow diagrams, design decisions |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Core engine | Pure TypeScript (zero framework deps) |
| UI components | React 18+, functional components, hooks only |
| Styling | Tailwind CSS with themeable CSS custom properties |
| Maps | Leaflet (free, zero-cost default) |
| Charts | Recharts (lightweight, React-native) |
| Demo app | Next.js 15 (App Router) |
| Testing | Vitest + Testing Library |
| Build | tsup (ESM + CJS + type declarations) |
| Monorepo | Turborepo + pnpm workspaces |
| Linting | Biome |

---

## Licence

MIT. Built by Jamie Blair ([jamieblair.co.uk](https://jamieblair.co.uk))
