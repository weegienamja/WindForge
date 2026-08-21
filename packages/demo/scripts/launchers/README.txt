WindForge — UK screening-data collection
=========================================

These Windows launchers resolve the repository relative to this folder. Generated
data is written under the repository's gitignored heatmap-data directory by default.

QUICK START
  1. Double-click "WindForge Control.bat".
  2. Pick a bounded area and coarse cell size.
  3. Click Start and leave the worker running. Successful cells resume across runs;
     failed cells remain retryable.
  4. Inspect heatmap-data/uk.db in a SQLite browser if needed.

DATA TABLES
  cells            grid registry and success/error status
  wind_resource    raw NASA POWER screening summary
  terrain          Open-Elevation elevation/slope/aspect plus legacy terrain band
  grid_access      mapped OSM power/road evidence
  geocode          Nominatim country/region/place context
  reanalysis       optional caller-supplied reconciliation diagnostics
  energy_yield     central, 10% downside, and 20% downside sensitivity cases
  economics        assumption-based LCOE/IRR/payback scenarios
  factor_scores    available scoring factors
  constraints      configured screening exclusions and warnings
  site_assessment  query-ready cell summary
  runs / meta      run status, counts, and schema version

LIMITATIONS
  - Smaller cells do not improve the native resolution of NASA POWER or other
    providers and dramatically increase public API load.
  - OpenStreetMap is supplementary and incomplete; the database is not a statutory
    or planning search.
  - Offshore composite scoring is disabled until bathymetry and offshore-grid
    evidence exist.
  - Do not commit generated databases, journals, logs, downloads, or live feed URLs
    containing credentials.

See docs/HEATMAP.md. The public map is:
  https://wind-forge-demo.vercel.app/map
