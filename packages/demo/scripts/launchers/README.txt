WindForge — UK wind-site data collection
=========================================

This folder holds the WindForge database and the tools to fill it.

FILES
  windforge.db          SQLite database (open in DBeaver). All collected data.
  heatmap.json          Rolling snapshot the website/live map reads.
  worker.log            Latest worker output (written by the control panel).
  start-worker.bat      Double-click: start collecting (whole UK, 20-acre cells).
  WindForge Control.bat Double-click: open the control panel (recommended).
  WindForge-Control.ps1 The control panel program (don't run directly).

QUICK START
  1. Double-click "WindForge Control.bat".
  2. Pick an area and cell size (20 acres is the default), optionally tick
     "Skip built-up land".
  3. Click Start. Leave it running — it resumes if you stop/restart.
  4. Open windforge.db in DBeaver to browse the data as it fills.

WHAT GETS STORED (open windforge.db in DBeaver)
  cells            grid registry (coordinate, on/offshore, land class)
  wind_resource    NASA POWER (mean speed, variability, Weibull)
  terrain          Open-Elevation (elevation, slope, aspect, roughness)
  grid_access      OSM (nearest power line / substation / road)
  geocode          Nominatim (country, region, place name)
  reanalysis       ERA5/CERRA bias-correction diagnostics
  energy_yield     capacity factor, AEP, P50/P75/P90, losses
  economics        LCOE, IRR, payback, subsidy-free flag
  factor_scores    the six suitability factors (one row each)
  constraints      hard constraints + warnings
  site_assessment  <-- the query-ready summary the website uses
  runs / meta      run log + schema version

  Example query (best subsidy-free farmland sites):
    SELECT lat, lng, composite_score, lcoe_per_mwh
    FROM site_assessment
    WHERE subsidy_free = 1 AND land_class = 'farmland'
    ORDER BY composite_score DESC
    LIMIT 100;

NOTES
  - 20-acre whole-UK is a long run (~a year of polite, rate-limited collection).
    It is fully resumable — closing and reopening continues where it left off.
  - The website's /map page reads heatmap.json. To show LIVE progress on the
    live site, expose the worker's feed (http://localhost:8088/heatmap.json)
    over a tunnel and open  https://wind.jamieblair.co.uk/map?src=<tunnel-url>
    (see docs/HEATMAP.md in the repo). Otherwise commit heatmap.json to deploy.
  - Requires the repo at C:\Users\jab19\wind-site-intelligence with pnpm
    installed. If you move it, edit the REPO path in start-worker.bat and
    WindForge-Control.ps1.
