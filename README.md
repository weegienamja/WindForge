# Wind Site Intelligence

[![CI](https://github.com/weegienamja/Wind-Site-Intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/weegienamja/Wind-Site-Intelligence/actions)
[![MIT Licence](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENCE)

Score and visualise wind turbine site suitability. A decision-support system that surfaces data and insights so human engineers make better-informed placement decisions.

**This is not an AI replacement tool.** It scores geographic locations by combining meteorological, terrain, infrastructure, and regulatory data into a weighted, human-readable analysis. The tool scores and informs. Humans decide.

---

## Features

- **6-factor scoring engine** - wind resource, terrain, grid proximity, land use, planning feasibility, access logistics
- **Wind shear extrapolation** - power law profile from 2m/50m reference to configurable hub height (default 80m)
- **Multi-height NASA POWER data** - WS2M, WS10M, WS50M with monthly, daily, and hourly resolutions from 1981 to present
- **19+ constraint definitions** - environmental, aviation, military, heritage, residential, infrastructure, water, and terrain constraints with setback buffers
- **Site boundary assessment** - draw or import (GeoJSON/KML) site boundaries, sample grid analysis, constraint exclusion zones
- **Energy yield estimation** - Annual Energy Production (AEP) with Weibull distribution fit, turbine power curve integration, 7-category loss stack, P50/P75/P90 scenarios
- **Turbine library** - 12+ built-in turbine models (660 kW to 8 MW) with power curves, plus custom CSV import
- **12 interactive React components** - map, charts, score cards, weight sliders, export
- **7 advanced components** - site boundary editor, constraint map/panel, turbine selector, energy yield card, loss stack chart, full assessment dashboard
- **PDF export** - comprehensive report with all charts, scores, and data sources
- **CLI** - terminal-based site analysis for scripting and automation
- **250+ tests** across 24 test files
- **Zero paid APIs** - all data from free, publicly accessible sources

---

## Quick Start

### Drop-in React Widget

```tsx
import { WindSiteScorer } from '@jamieblair/wind-site-intelligence';

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

```typescript
import { analyseSite } from '@jamieblair/wind-site-intelligence-core';

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

```typescript
import { createBoundary, assessSite } from '@jamieblair/wind-site-intelligence-core';

const boundary = createBoundary([
  { lat: 55.87, lng: -4.30 },
  { lat: 55.87, lng: -4.20 },
  { lat: 55.85, lng: -4.20 },
  { lat: 55.85, lng: -4.30 },
], 'Glasgow West');

const assessment = await assessSite(boundary, { hubHeightM: 100 });
```

### Energy Yield Estimation

```typescript
import { calculateAep, getTurbineById } from '@jamieblair/wind-site-intelligence-core';

const turbine = getTurbineById('vestas-v110-2000');
const result = await calculateAep(windData, turbine, { hubHeightM: 100 });

console.log(`Net AEP: ${result.value.netAepMwh.toFixed(0)} MWh`);
console.log(`Capacity Factor: ${(result.value.capacityFactorNet * 100).toFixed(1)}%`);
```

### CLI

```bash
npx tsx packages/core/src/cli.ts 55.86 -4.25
npx tsx packages/core/src/cli.ts 58.21 -5.03 --hub-height 100
```

---

## Architecture

```
packages/
  core/     Pure TypeScript scoring engine, data sources, analysis, energy yield
  ui/       React components and hooks consuming core
  demo/     Next.js 15 app for development and public showcase
```

| Package | npm | Description |
|---------|-----|-------------|
| `@jamieblair/wind-site-intelligence-core` | Core | Scoring engine, data source clients, wind analysis, energy yield, constraint detection, turbine library, types |
| `@jamieblair/wind-site-intelligence` | UI | React components, charts, hooks, PDF export, theming |

The core package has **zero React or DOM dependencies** and can be used in any JavaScript runtime (Node.js, Deno, Bun, browser). The UI package is React 18+ with Leaflet maps, Recharts charts, and Tailwind CSS.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full data flow and design decisions.

---

## Scoring Engine

### Six Scoring Factors

| Factor | Default Weight | Data Source | Description |
|--------|---------------|-------------|-------------|
| Wind Resource | 0.35 | NASA POWER | Multi-height wind speed (2m, 10m, 50m), consistency, directional stability, extrapolated to hub height |
| Terrain Suitability | 0.20 | Open-Elevation | Elevation, slope gradient, aspect, surface roughness class |
| Grid Proximity | 0.15 | OSM Overpass | Distance to 132kV+ transmission lines and substations |
| Land Use Compatibility | 0.15 | OSM Overpass | Protected areas, residential buffers, farmland (positive), forests (negative) |
| Planning Feasibility | 0.10 | Nominatim + Overpass | Proximity to existing wind farms, population density, regional context |
| Access Logistics | 0.05 | OSM Overpass | Road network quality within 5km |

- Scores are normalised 0-100 per factor
- Weights are user-adjustable and always normalised to sum to 1.0
- Any factor scoring below 20 triggers a **hard constraint flag**
- The engine never outputs a binary yes/no - it presents scored trade-offs for humans to interpret
- All 6 data fetches run in parallel via `Promise.allSettled()` - one API failure never blocks others

### Wind Shear Extrapolation

NASA POWER provides wind speed at 2m, 10m, and 50m. Real turbines operate at 80-120m hub height. The engine extrapolates using the power law wind profile:

```
v_hub = v_ref * (h_hub / h_ref) ^ alpha
```

- Uses 50m as reference height when available (significantly more accurate than 2m)
- Alpha (wind shear exponent) is derived from terrain roughness class, not hardcoded
- Hub height is configurable (default 80m)
- Detail strings show speed at all measured heights plus the extrapolated value

### Constraint System

19+ constraint definitions across 8 categories with configurable setback buffers:

| Category | Examples | Severity |
|----------|----------|----------|
| Environmental | Nature reserves, SSSI, SAC, SPA | Hard |
| Aviation | Airports (5km setback), helipads (2km) | Hard |
| Military | Military land | Hard |
| Heritage | Listed buildings (1km setback) | Soft |
| Residential | Dwellings (500m-1km depending on turbine size) | Soft |
| Infrastructure | Power lines, railways | Soft |
| Water | Rivers, lakes, coastal zones | Soft |
| Terrain | Slopes > 25% | Soft |

Hard constraints block a site entirely. Soft constraints reduce the score but allow development.

### Energy Yield Estimation

- Weibull distribution fit to wind regime at hub height
- Power curve integration against Weibull PDF for gross AEP
- Air density correction based on elevation
- 7-category loss stack: wake, electrical, availability, environmental, icing, hysteresis, grid curtailment
- P50/P75/P90 confidence scenarios using interannual variability
- Monthly production breakdown

### Turbine Library

12+ built-in turbine models across 4 power classes:

| Class | Example | Capacity | Rotor |
|-------|---------|----------|-------|
| Small | Vestas V47-660 | 660 kW | 47m |
| Medium | Siemens SWT-2.3-93 | 2.3 MW | 93m |
| Large | GE 3.6-137 | 3.6 MW | 137m |
| Extra Large | Siemens SWT-8.0-154 | 8 MW | 154m |

Custom turbines can be added via CSV power curve import using `parsePowerCurveCSV()`.

### Turbine Layout Estimation

- Rectangular grid with 4D crosswind / 7D downwind spacing
- Grid aligned to prevailing wind direction
- Exclusion zone filtering (constraints + boundary)
- Returns position count, viable area percentage, spacing metrics

---

## Data Sources

All data comes from **free, publicly accessible APIs**. No paid API keys required.

| Data Layer | Source | Provides |
|-----------|--------|----------|
| Wind speed/direction | [NASA POWER API](https://power.larc.nasa.gov) | WS2M, WS10M, WS50M, WD10M, WD50M from 1981 to present (monthly, daily, hourly, climatology) |
| Terrain/elevation | [Open-Elevation API](https://open-elevation.com) | Elevation, calculated slope, roughness class |
| Grid infrastructure | [OSM Overpass API](https://overpass-api.de) | Transmission lines (132kV+), substations, roads, land use, existing wind farms |
| Reverse geocoding | [OSM Nominatim](https://nominatim.openstreetmap.org) | Country/region context for planning feasibility |

### Resilience

- Retry logic with exponential backoff on all API calls
- Aggressive caching (historical data: 7 days, operational: 24 hours)
- 20-second timeout on Overpass queries with graceful degradation
- Neutral score (50) with `confidence: 'low'` when a data source fails
- Analysis always completes, even if individual sources are unavailable

See [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) for full details on endpoints, rate limits, and caching strategies.

---

## Wind Analysis

Pure functions that take historical wind data and produce chart-ready output:

| Function | Input | Output |
|----------|-------|--------|
| `computeWindTrend()` | Monthly history (1981-present) | Linear regression, slope per decade, R-squared, trend direction |
| `computeSeasonalHeatmap()` | Hourly data | Year x month grid colour-coded by wind speed, best/worst season |
| `computeMonthlyBoxPlots()` | Monthly history | 12 months with min/Q1/median/Q3/max/outliers |
| `computeDiurnalProfile()` | Hourly data | 24-hour avg/min/max curve, peak and trough hours |
| `computeSpeedDistribution()` | Daily data | Frequency histogram, Weibull k and c parameters |
| `computeYearOverYear()` | Monthly history | Per-year comparison data |

---

## UI Components

### Core Components

| Component | Purpose |
|-----------|---------|
| `<WindSiteScorer />` | Top-level orchestrator: map, inputs, weight sliders, score card, all wired together |
| `<SiteMap />` | Leaflet interactive map with click-to-analyse, pin markers, and heatmap overlay |
| `<ScoreCard />` | Composite score and per-factor bar breakdown with hard constraint flags |
| `<WeightSliders />` | Six range sliders for real-time weight adjustment |
| `<ScenarioCompare />` | Side-by-side comparison of 2-4 analysed sites with per-factor winner highlighting |
| `<ExportButton />` | PDF report generation with embedded chart images |
| `<WindRose />` | 16-point compass rose showing wind direction frequency by speed band |
| `<WindTrendChart />` | Monthly wind speed line chart (1981-present) with annual average and regression overlay |
| `<SeasonalHeatmap />` | Month x year heatmap colour-coded by wind speed |
| `<MonthlyBoxPlot />` | Box-and-whisker chart for monthly wind speed distributions |
| `<DiurnalProfile />` | 24-hour area chart showing mean/min/max wind speed by hour |
| `<WindSpeedDistribution />` | Wind speed frequency histogram with Weibull curve overlay |

### Site Assessment Components

| Component | Purpose |
|-----------|---------|
| `<SiteBoundaryEditor />` | Polygon boundary editor with lat/lng inputs, GeoJSON/KML import |
| `<ConstraintPanel />` | Tabular view of all detected constraints with severity badges |
| `<ConstraintMap />` | 2D SVG map of constraint locations relative to site boundary |
| `<TurbineSelector />` | Grouped dropdown of 12+ turbine models with specs |
| `<EnergyYieldCard />` | AEP results: gross/net MWh, capacity factor, P50/P75/P90 scenarios |
| `<LossStackChart />` | Stacked horizontal bar showing all 7 loss categories with percentages |
| `<SiteAssessmentView />` | Full parcel assessment dashboard with scores, constraints, energy, layout |

All components accept `className` and `theme` props for styling customisation. See [docs/COMPONENTS.md](docs/COMPONENTS.md) for full props reference and usage examples.

### Hooks

| Hook | Purpose |
|------|---------|
| `useSiteScore()` | Manages analysis state, calls `analyseSite()`, handles loading/error/cancellation |
| `useWindData()` | Fetches wind summary for a coordinate |
| `useMapInteraction()` | Manages map pin state during analysis |

---

## Demo App

The demo app is a Next.js 15 (App Router) application showcasing all features:

- **Quick Scan**: click anywhere on the Leaflet map to score a location instantly
- **Progressive chart loading**: scoring appears first, then historical charts stream in as data arrives
- **Detailed analysis**: fetch daily (5 years) and hourly (1 year) data for diurnal profiles and speed distributions
- **Site boundary editor**: draw or import parcel boundaries for full site assessment
- **Constraint detection**: visualise all environmental, aviation, and regulatory constraints
- **Turbine selection**: pick from 12+ turbine models and estimate energy yield
- **PDF export**: generate a comprehensive analysis report

---

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Development mode (demo app with hot reload)
pnpm dev

# Lint and format
pnpm lint
pnpm format
```

### Monorepo Tooling

- **Turborepo** for workspace orchestration
- **pnpm** as the package manager
- **TypeScript** everywhere, strict mode enabled
- **Vitest** for unit and integration tests (250+ tests, 24 test files)
- **Biome** for linting and formatting (not ESLint/Prettier)
- **tsup** for bundling core and UI packages for npm publish

### Testing

```bash
# Run all tests
pnpm test

# Run core tests only
pnpm --filter @jamieblair/wind-site-intelligence-core test

# Run UI tests only
pnpm --filter @jamieblair/wind-site-intelligence test
```

Coverage spans scoring logic, data source clients, wind analysis, constraint detection, energy yield calculations, geometry utilities, site boundaries, turbine library, and UI component rendering.

---

## Documentation

| Document | Content |
|----------|---------|
| [docs/API.md](docs/API.md) | Full core SDK reference: scoring, data fetching, wind analysis, energy yield, types |
| [docs/COMPONENTS.md](docs/COMPONENTS.md) | UI component props tables and usage examples |
| [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) | External API details: endpoints, parameters, rate limits, caching |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Package structure, data flow, design decisions |

---

## Licence

MIT. Author: Jamie Blair ([jamieblair.co.uk](https://jamieblair.co.uk))
