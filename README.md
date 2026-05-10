# WindForge

Open-source wind site suitability with bias-corrected reanalysis and a Model Context Protocol server.

[![npm version](https://img.shields.io/npm/v/@jamieblair/windforge-mcp?label=npm%20%40jamieblair%2Fwindforge-mcp)](https://www.npmjs.com/package/@jamieblair/windforge-mcp)
[![Tests](https://img.shields.io/badge/tests-925%20passing-brightgreen)](#development)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org/)
[![CI](https://img.shields.io/github/actions/workflow/status/weegienamja/WindForge/ci.yml?branch=main&label=build)](https://github.com/weegienamja/WindForge/actions)

![WindForge analyse page](docs/screenshots/analyse-page.png)

## What this is

- Six-factor scoring engine for wind turbine site suitability. Uses public data only: NASA POWER, ERA5, CERRA, OpenStreetMap, Open-Elevation.
- Bias-corrected wind resource. NASA POWER is statistically corrected against ERA5 and CERRA reanalysis using quantile mapping or variance scaling.
- Model Context Protocol server. Exposes the engine to Claude, Cursor, and any MCP-compatible agent through six tools.

## Demo

Live demo: https://windforge.example

- Set `CDS_API_KEY` in your local env to enable bias correction in development.

## Quick start

### Use it from Claude Desktop

```json
{
  "mcpServers": {
    "windforge": {
      "command": "npx",
      "args": ["-y", "@jamieblair/windforge-mcp"],
      "env": { "CDS_API_KEY": "your-key-here" }
    }
  }
}
```

### Use it as an SDK

```ts
import { analyseSite } from '@jamieblair/windforge-core';

const result = await analyseSite({
  coordinate: { lat: 55.86, lng: -4.25 },
  hubHeightM: 100,
});
```

### Use it as a CLI

```bash
npx tsx packages/core/src/cli.ts 55.86 -4.25 --hub-height 100
```

## What it measures

| Factor | Weight | Source |
| --- | --- | --- |
| Wind resource | 0.35 | NASA POWER, optionally bias-corrected against ERA5 / CERRA |
| Terrain suitability | 0.20 | Open-Elevation (slope, surface roughness) |
| Grid proximity | 0.15 | OpenStreetMap Overpass (transmission lines, substations) |
| Land use compatibility | 0.15 | OpenStreetMap (protected areas, residential buffers, farmland) |
| Planning feasibility | 0.10 | Nominatim region context, OSM existing wind farms, density proxy |
| Access logistics | 0.05 | OpenStreetMap road network |

See [docs/TECHNICAL-SPEC.md](docs/TECHNICAL-SPEC.md) for the full scoring rubric, thresholds, and confidence rules.

## Architecture

WindForge is a pnpm + Turborepo monorepo with strict separation between `core` (pure TypeScript, headless, zero React or DOM dependencies) and `ui` (React, Recharts, Leaflet). The MCP server wraps `core` for AI agent consumption, and the demo app composes `core` and `ui` into the live analyse page.

```
packages/
  core/    Scoring engine, datasource clients, analysis modules
  ui/      React components (charts, maps, score cards)
  mcp/     Model Context Protocol server (six tools over stdio)
  demo/    Next.js 15 demo app (the live site)
```

## Bias correction

NASA POWER provides global wind data at roughly 50km resolution but is known to systematically misestimate speeds in complex terrain. WindForge fetches ERA5 (about 31km) or CERRA (about 5.5km, Europe) reanalysis when a Copernicus CDS API key is configured, then statistically corrects NASA POWER against the higher-resolution reference using quantile mapping or variance scaling. The corrected series, before-and-after diagnostics, and confidence rating are surfaced in every analysis. See [docs/BIAS-CORRECTION.md](docs/BIAS-CORRECTION.md) for the full methodology.

## Documentation

- [Technical specification](docs/TECHNICAL-SPEC.md). Every file, every function, every export.
- [Architecture](docs/ARCHITECTURE.md). Design decisions and invariants.
- [Bias correction methodology](docs/BIAS-CORRECTION.md). Algorithms, references, validation.
- [Roadmap](ROADMAP.md). What is next. Honest version.
- [Contributing](CONTRIBUTING.md). How to help.
- [Changelog](CHANGELOG.md). Version history.
- [Pre-publish checklist](PRE-PUBLISH-CHECKLIST.md). Release process.

## Development

### Setup

```bash
pnpm install
pnpm test
pnpm dev --filter @jamieblair/windforge-demo
```

Node 20 or later and pnpm 9 or later are expected.

### Gates

```bash
pnpm check          # Typecheck, lint, tests, build verification
pnpm test           # 925 tests across four packages
pnpm test:watch     # Vitest UI
```

The `pnpm check` script aggregates the typecheck, lint, full test run, demo production build verification, and the MCP package validation. CI mirrors this gate.

### Publishing

```bash
pnpm --filter @jamieblair/windforge-mcp validate-publish
cd packages/mcp && npm publish
```

The validator asserts tarball size, contents, package.json metadata, and required README sections before allowing a publish.

## License and credits

License: MIT. See [LICENSE](LICENSE).

Author: Jamie Blair, [jamieblair.co.uk](https://jamieblair.co.uk).

### Acknowledgements

WindForge stands on public datasets. Thanks to the teams that maintain them.

- [NASA POWER](https://power.larc.nasa.gov/) for global hourly, daily, and monthly meteorology.
- [ECMWF ERA5](https://www.ecmwf.int/en/forecasts/dataset/ecmwf-reanalysis-v5) for global reanalysis.
- [Copernicus CERRA](https://climate.copernicus.eu/copernicus-regional-reanalysis-europe-cerra) for European high-resolution reanalysis.
- [OpenStreetMap](https://www.openstreetmap.org/) contributors for grid, land use, and road data, available under the [Open Database License](https://opendatacommons.org/licenses/odbl/).
- [Open-Elevation](https://open-elevation.com/) for free elevation queries.

Built in Scotland.
