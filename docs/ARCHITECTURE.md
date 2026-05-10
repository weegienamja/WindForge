# Architecture

WindForge uses a **layered architecture** with strict separation between the data/scoring core and the UI layer. The core is pure TypeScript with zero framework dependencies. The UI wraps core in React components.

## Package Structure

```
windforge/
  packages/
    core/     Pure TypeScript - no React, no DOM, runs anywhere
    ui/       React 18+ components consuming core
    demo/     Next.js 15 app for development and showcase
  docs/       API reference, component docs, architecture guide
  .github/    CI/CD and Copilot instructions
  turbo.json  Turborepo pipeline config
```

## High-Level Data Flow

```
                    +-------------------+
                    |    Consumer App   |
                    +-------------------+
                            |
              +-------------+-------------+
              |                           |
     +--------v--------+        +--------v--------+
     |   @windforge     |        | @windforge-core |
     |   (React UI)     |------->|  (Pure TS)      |
     +------------------+        +------------------+
                                         |
                    +--------------------+--------------------+
                    |                    |                    |
              +-----v-----+     +-------v-------+    +------v------+
              | NASA POWER |     | OSM Overpass  |    | Open-Elev.  |
              | (wind)     |     | (infra, land) |    | (terrain)   |
              +------------+     +---------------+    +-------------+
```

## Scoring Data Flow

```
User clicks map / calls analyseSite()
    |
    v
useSiteScore() --> analyseSite() [core]
    |
    +--> fetchWindData()        --> NASA POWER API
    +--> fetchElevationData()   --> Open-Elevation API
    +--> fetchGridInfra()       --> Overpass API
    +--> fetchLandUse()         --> Overpass API
    +--> fetchRoadAccess()      --> Overpass API
    +--> fetchNearbyWindFarms() --> Overpass API
    +--> reverseGeocode()       --> Nominatim API
    |
    v (Promise.allSettled - all in parallel)
    |
    +--> windResourceScorer()
    +--> terrainScorer()
    +--> gridProximityScorer()
    +--> landUseScorer()
    +--> planningScorer()
    +--> accessScorer()
    |
    v
SiteAnalysis --> ScoreCard (display)
    |
    v (optional, triggered after scoring)
    |
    +--> fetchMonthlyWindHistory() --> computeWindTrend()
    +--> fetchDailyWindData()      --> computeSpeedDistribution()
    +--> fetchHourlyWindData()     --> computeDiurnalProfile()
    |
    v
Chart components (WindTrendChart, SeasonalHeatmap, etc.)
```

## Analysis Module Architecture

```
+------------------------------------------------------+
|                    ANALYSIS LAYER                     |
+------------------------------------------------------+
|                                                      |
|  Noise Propagation          Shadow Flicker           |
|  (ISO 9613-2)               (Meeus ephemeris)        |
|  noise-propagation.ts        shadow-flicker.ts       |
|  etsu-assessment.ts          shadow-calendar.ts      |
|  noise-contours.ts           solar-position.ts       |
|                                                      |
|  Wake Modelling             Terrain Flow             |
|  (Jensen + Bastankhah)       (Jackson-Hunt)          |
|  jensen-wake.ts              terrain-speedup.ts      |
|  bastankhah-wake.ts          rix-calculator.ts       |
|  wake-loss-calculator.ts     elevation-grid.ts       |
|                                                      |
|  Financial Model            Turbulence / Extreme     |
|  (LCOE, IRR, payback)       (IEC 61400-1)           |
|  financial-model.ts          turbulence.ts           |
|  scenario-analysis.ts        extreme-wind.ts         |
|                                                      |
|  Layout Optimiser           Visual Impact            |
|  (hill-climbing)             (viewshed/ZTV)          |
|  layout-optimiser.ts         viewshed.ts             |
|                                                      |
|  On-Site Data               Cumulative Impact        |
|  (MCP analysis)              (proposed + existing)   |
|  met-mast-parser.ts          cumulative-impact.ts    |
|  mcp-analysis.ts                                     |
|  data-quality.ts            IEC Reporting            |
|                              iec-report.ts           |
+------------------------------------------------------+
```

## Design Decisions

### Functions over classes

All scoring logic and data fetching uses plain functions. This keeps the code composable and trivially testable without lifecycle management or constructor complexity.

### Result types over exceptions

Every scoring and data-fetching function returns `Result<T, ScoringError>` instead of throwing exceptions. This forces callers to handle failures explicitly and enables graceful degradation when individual data sources fail.

### Pure analysis functions

The analysis modules (noise, wake, shadow, financial, etc.) are pure functions with no side effects. Data goes in, results come out. This makes them independently testable and reusable in any context.

### In-memory caching

Each data source client maintains its own in-memory cache with configurable TTL. Historical data caches longer (7 days for monthly wind) while volatile data caches shorter (24 hours for daily/hourly). The spatial cache adds tile-based geographic indexing with LRU eviction.

### Parallel data fetching

The scoring engine uses `Promise.allSettled()` to fetch from all data sources simultaneously. If any source fails or times out, the analysis still completes with degraded scores (neutral 50, confidence 'low') rather than failing entirely.

### Data validation at boundaries

All incoming data passes through validation at system boundaries. Wind speeds are range-checked (0-100 m/s), directions are wrapped to 0-360, NaN values are caught and handled, and coordinates are verified. This prevents garbage data from silently corrupting analysis results.

## Monorepo Tooling

| Tool | Job |
|------|-----|
| Turborepo | Task orchestration, build caching |
| pnpm | Fast, disk-efficient package management with workspaces |
| TypeScript | Type safety, strict mode across all packages |
| Vitest | 931 tests across core, ui, mcp, and demo packages |
| Biome | Linting and formatting (replaces ESLint + Prettier) |
| tsup | Bundling for npm publish (ESM + CJS + DTS) |
| Next.js | Demo app (App Router) |
