# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2025-07-08

### Added

- **Noise Modelling**: ISO 9613-2 sound propagation model with turbine noise sources, atmospheric absorption, ground effects, and contour generation for planning compliance
- **Shadow Flicker Analysis**: Sun position calculation, shadow casting geometry, annual flicker duration estimation per receptor, and calendar visualisation support
- **Wake Modelling**: Jensen and Bastankhah wake deficit models, multi-turbine wake superposition, and array efficiency calculation for wind farm layouts
- **Terrain Flow Modelling**: Speed-up factor estimation over hills and ridges, terrain complexity assessment, and flow inclination angle calculation
- **Financial Modelling**: LCOE calculator, CAPEX/OPEX estimation, revenue projection with degradation and price escalation, NPV and payback period analysis
- **Turbulence and Extreme Wind**: Ambient turbulence intensity estimation, IEC turbulence class assessment, and extreme wind speed (50-year return period) calculation
- **On-Site Data Integration**: Mast data ingestion, measurement-correlate-predict (MCP) correction, and data completeness and quality checks
- **Visual Impact Assessment**: Viewshed analysis with ZTV (Zone of Theoretical Visibility) calculation based on terrain elevation profiles
- **Cumulative Impact Assessment**: Multi-project combined impact evaluation for noise, visual, and ecological effects across neighbouring wind farm developments
- **IEC Compliance Reporting**: Structured report generation covering all IEC 61400-1 site assessment parameters
- **ERA5 Reanalysis Client**: Optional high-resolution (31km) global wind data from Copernicus CDS, with automatic fallback to NASA POWER
- **CERRA Reanalysis Client**: Optional very-high-resolution (5.5km) European wind data from Copernicus CDS, with domain boundary validation
- **Spatial Cache**: Tile-based spatial caching with LRU eviction for efficient repeated lookups across nearby coordinates
- **Data Validation**: Input validation and cross-source consistency checks for wind data, elevation data, and Overpass responses
- **Turbine Layout Optimiser**: Constraint-aware turbine placement with minimum spacing enforcement and boundary clipping
- **931 tests** across all four packages

### Changed

- Project renamed from Wind Site Intelligence to **WindForge**
- npm packages renamed to `@jamieblair/windforge-core` and `@jamieblair/windforge`
- GitHub repository renamed to `weegienamja/WindForge`
- Updated all documentation with platform overview diagrams, architecture diagrams, and full API reference
- Updated README with ASCII art title, feature highlights, and comprehensive quick start guide

## [0.2.0] - 2025-06-15

### Added

- **Constraint System**: Exclusion zone detection (environmental, cultural, aviation, residential setback), constraint geometry with buffer zones, and hard constraint flagging in the scoring engine
- **Energy Yield Estimation**: Annual energy production (AEP) calculator using wind speed distribution, power curves, and availability factors
- **Turbine Library**: Built-in database of common turbine models with power curves, rated power, rotor diameter, and hub height specifications
- **Site Boundary Assessment**: Polygon-based site boundary definition with buildable area calculation and setback enforcement
- **Power Curve Parser**: Import and validate manufacturer turbine power curve data

## [0.1.0] - 2025-03-30

### Added

- **Core Scoring Engine**: 6-factor weighted scoring system (wind resource, terrain suitability, grid proximity, land use compatibility, planning feasibility, access logistics)
- **NASA POWER Integration**: Multi-height wind data (2m, 10m, 50m) with monthly, daily, and hourly temporal resolutions from 1981 to present
- **Wind Shear Extrapolation**: Power law wind profile extrapolation from reference height to configurable hub height (default 80m), using terrain-derived roughness alpha
- **Data Sources**: NASA POWER API, Open-Elevation API, OpenStreetMap Overpass API, OSM Nominatim
- **Wind Analysis Module**: Pure functions for trend analysis (linear regression), seasonal heatmaps, monthly box plots, diurnal profiles, speed distribution (Weibull fit), year-over-year comparison
- **React Components**: WindSiteScorer, SiteMap (Leaflet with heatmap overlay), ScoreCard, WeightSliders, WindRose, WindTrendChart, SeasonalHeatmap, MonthlyBoxPlot, DiurnalProfile, WindSpeedDistribution, ScenarioCompare, ExportButton (PDF)
- **Hooks**: useSiteScore, useMapInteraction, useWindData
- **Demo App**: Next.js 15 App Router with progressive chart loading
- **250 tests** across 16 test files
- **CI/CD**: GitHub Actions workflow for test, build, and npm publish on tag push
