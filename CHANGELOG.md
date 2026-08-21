# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Changed

- Moved the public analysis workflow behind a validated, no-store server API and made its resolved wind resource canonical for scoring and AEP.
- Added explicit completeness/evidence states and withheld composite scores when required provider evidence is missing.
- Replaced centroid-based constraint decisions with Point/LineString/Polygon/MultiPolygon geometry, including holes, intersections, buffers, nearest distance, and clipped area.
- Updated ERA5 to the current CDS retrieve-v1 job API and disabled automated CERRA correction until its temporal aggregation is defensible.
- Relabelled AEP P-values as deterministic central/10%/20% downside sensitivities and reframed noise, turbulence, extreme wind, and reporting as screening outputs.
- Hardened Overpass requests/failover, heatmap retry/run accounting, dependencies, CI, package metadata, documentation, and repository security guidance.

### Security

- Confirmed provider credentials remain server-side, added strict API input/body limits and generic unexpected-error responses, and expanded generated/local artifact ignores.

## [0.3.0] - 2025-07-08

### Added

- **Noise Modelling**: simplified ISO 9613-2-style propagation with turbine sources, atmospheric absorption, ground effects, and screening contours
- **Shadow Flicker Analysis**: Sun position calculation, shadow casting geometry, annual flicker duration estimation per receptor, and calendar visualisation support
- **Wake Modelling**: Jensen and Bastankhah wake deficit models, multi-turbine wake superposition, and array efficiency calculation for wind farm layouts
- **Terrain Flow Modelling**: Speed-up factor estimation over hills and ridges, terrain complexity assessment, and flow inclination angle calculation
- **Financial Modelling**: LCOE calculator, CAPEX/OPEX estimation, revenue projection with degradation and price escalation, NPV and payback period analysis
- **Wind variability and return levels**: coarse screening helpers whose temporal-resolution limitations are explicit; no IEC class is assigned
- **On-Site Data Integration**: Mast data ingestion, measurement-correlate-predict (MCP) correction, and data completeness and quality checks
- **Visual Impact Assessment**: Viewshed analysis with ZTV (Zone of Theoretical Visibility) calculation based on terrain elevation profiles
- **Cumulative Impact Assessment**: Multi-project combined impact evaluation for noise, visual, and ecological effects across neighbouring wind farm developments
- **Screening Report Data**: Structured pre-feasibility report generation with explicit unavailable values and model limitations
- **ERA5 Reanalysis Client**: Optional global wind data adapter from Copernicus CDS
- **CERRA Research Utilities**: European domain validation and parsing utilities (automated retrieval is disabled in the current release)
- **Spatial Cache**: Tile-based spatial caching with LRU eviction for efficient repeated lookups across nearby coordinates
- **Data Validation**: Input validation and cross-source consistency checks for wind data, elevation data, and Overpass responses
- **Turbine Layout Optimiser**: Constraint-aware turbine placement with minimum spacing enforcement and boundary clipping
- **900+ tests** across all four packages

### Changed

- Project renamed from Wind Site Intelligence to **WindForge**
- npm packages renamed to `@jamieblair/windforge-core` and `@jamieblair/windforge`
- GitHub repository renamed to `weegienamja/WindForge`
- Updated all documentation with platform overview diagrams, architecture diagrams, and full API reference
- Updated README with ASCII art title, feature highlights, and comprehensive quick start guide

## [0.2.0] - 2025-06-15

### Added

- **Constraint System**: Screening-exclusion detection (environmental, cultural, aviation, residential setback), real feature geometry with buffers, and explicit OSM evidence limitations
- **Energy Yield Estimation**: Annual energy production (AEP) calculator using wind speed distribution, power curves, and availability factors
- **Turbine Library**: Built-in database of common turbine models with power curves, rated power, rotor diameter, and hub height specifications
- **Site Boundary Assessment**: Polygon-based site boundary definition with buildable area calculation and setback enforcement
- **Power Curve Parser**: Import and validate manufacturer turbine power curve data

## [0.1.0] - 2025-03-30

### Added

- **Core Scoring Engine**: 6-factor weighted scoring system (wind resource, terrain suitability, grid proximity, land use compatibility, planning feasibility, access logistics)
- **NASA POWER Integration**: Multi-height wind data (2m, 10m, 50m) with monthly, daily, and hourly temporal resolutions from 1981 to present
- **Wind Shear Extrapolation**: Power-law wind profile extrapolation from reference height to configurable hub height (the current release uses an explicit fixed screening exponent)
- **Data Sources**: NASA POWER API, Open-Elevation API, OpenStreetMap Overpass API, OSM Nominatim
- **Wind Analysis Module**: Pure functions for trend analysis (linear regression), seasonal heatmaps, monthly box plots, diurnal profiles, speed distribution (Weibull fit), year-over-year comparison
- **React Components**: WindSiteScorer, SiteMap (Leaflet with heatmap overlay), ScoreCard, WeightSliders, WindRose, WindTrendChart, SeasonalHeatmap, MonthlyBoxPlot, DiurnalProfile, WindSpeedDistribution, ScenarioCompare, ExportButton (PDF)
- **Hooks**: useSiteScore, useMapInteraction, useWindData
- **Demo App**: Next.js 15 App Router with progressive chart loading
- **250 tests** across 16 test files
- **CI/CD**: GitHub Actions workflow for test, build, and npm publish on tag push
