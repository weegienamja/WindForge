# Roadmap

The honest version. WindForge is a personal project; this list reflects what
exists today, what would get built if there were demand, and what will not be
built no matter how much demand there is.

## Shipped

- Six-factor scoring engine across wind, terrain, grid, land use, planning, access.
- Polygon-based site assessment with hard, soft, and info constraint detection.
- ISO 9613-2 noise modelling, shadow flicker simulation, IEC 61400-1 turbulence and extreme wind classification.
- Weibull-based AEP with P50, P75, P90 estimates and a 7-item loss stack.
- Jensen and Bastankhah wake models with directional integration.
- Cumulative impact assessment for noise, shadow, and viewshed.
- ERA5 and CERRA reanalysis bias correction with quantile mapping and variance scaling.
- 12 plus built-in turbine models with full power curves.
- React UI components: maps, charts, scoring panels, constraint visualisations.
- MCP server exposing six tools to AI agents over stdio.
- 925 automated tests, four-package monorepo, full typecheck and lint coverage.
- Validation tooling: demo production build verifier and MCP publish gate.

## Considered, not committed

Items below would be reasonable next steps. None are scheduled. Each lists
what would need to happen to move it onto the build list.

- **Multi-source wind reconciliation.** Currently picks CERRA over ERA5 when both are available. Could blend the two with weights based on local overlap quality. *Unlock:* evidence the single-source pick is wrong for specific site classes (offshore, alpine, coastal complex terrain).
- **Cumulative wake from existing farms.** Merge upstream existing turbine wakes into AEP losses for constrained sites near operating farms. *Unlock:* a request from someone doing constrained-site analysis where this matters.
- **Heatmap pre-fetch.** Worker-side coarse-grid scorer for map exploration so users can see suitability gradients before clicking. *Unlock:* real users hitting the map and finding the click-to-score loop too slow.
- **Persistent cache adapter.** IndexedDB or SQLite layer behind the in-memory cache so reanalysis fetches survive page reloads. *Unlock:* API rate limits becoming a real-world problem in regular use.
- **Offshore mode.** Add a bathymetry source and reframe terrain scoring for water depth, distance to shore, and seabed type. *Unlock:* an offshore project worth pursuing.
- **Sector management for noise and shadow.** Suggest curtailment schedules that keep impacted receptors within ETSU and shadow-flicker thresholds. *Unlock:* a real wind farm developer engaging with the tool seriously.

## Not building

The list reviewers usually want to see and roadmaps usually omit.

- **A SaaS product.** WindForge is open source, headless, and self-hosted by design. No accounts, no billing, no closed-source server.
- **A formal site assessment certification.** WindForge is a decision-support tool. Formal IEC or country-specific certification is out of scope and always will be.
- **Mobile-first UI.** The data density of the analyse view does not work on small screens. A text-only fallback ships for narrow viewports; a full mobile redesign is not coming.
- **Real-time data.** WindForge uses public reanalysis and historical data. Live SCADA integration, near-real-time forecasting, and operational dashboards are outside the project's scope.
- **Internationalisation.** English only. The maintenance ceiling on a multi-language scientific tool with this much UI text is not realistic for a personal project.
- **A hosted MCP service.** The MCP server runs locally over stdio. A hosted variant with auth, billing, and rate limiting is explicitly out of scope.

If something on the "considered" list matters to you, open an issue with the
use case. If something on the "not building" list matters to you, fork the
repo. The MIT license is permissive on purpose.
