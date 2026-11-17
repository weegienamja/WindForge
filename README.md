# WindForge

Open-source, screening-level evidence for early wind-energy site investigation.

[![npm version](https://img.shields.io/npm/v/@jamieblair/windforge-mcp?label=npm%20%40jamieblair%2Fwindforge-mcp)](https://www.npmjs.com/package/@jamieblair/windforge-mcp)
[![CI](https://img.shields.io/github/actions/workflow/status/weegienamja/WindForge/ci.yml?branch=main&label=CI)](https://github.com/weegienamja/WindForge/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Live demo:** https://windforge.khmer-iq.workers.dev

The engineering workspace opens on an interactive turbine schematic. It includes three IEA reference designs, published blade sections and a searchable source library. When the live engineering service is unavailable, the explorer can display the public revision bundled with the application.

WindForge combines public wind, elevation, OpenStreetMap, and geocoding evidence into an explained six-factor screen. It also includes reusable TypeScript modules for energy-yield sensitivity, layouts, wakes, noise, shadow flicker, wind-condition screening, finance, and report data, plus a local Model Context Protocol (MCP) server.

WindForge is for comparing candidate locations and identifying questions for deeper investigation. It is not a planning search, statutory designation search, bankable energy assessment, IEC site-suitability determination, acoustic compliance assessment, or substitute for site measurements and qualified professional review.

## What the point analysis does

The default public analysis runs on the server and uses:

| Factor | Weight | Evidence |
| --- | ---: | --- |
| Wind resource | 0.35 | NASA POWER long-term gridded data |
| Terrain suitability | 0.20 | Open-Elevation samples and derived local slope/aspect |
| Grid proximity | 0.15 | OpenStreetMap power lines and substations |
| Land-use compatibility | 0.15 | Supplementary OpenStreetMap land-use and protected-area geometry |
| Planning feasibility | 0.10 | Nominatim regional context and OpenStreetMap wind installations |
| Access logistics | 0.05 | OpenStreetMap road geometry |

Provider failures are recorded as missing evidence. If a required factor is unavailable, WindForge withholds the composite score instead of substituting a neutral value. Results include completeness, provenance, failed sources, confidence, the raw/resolved wind resource, and any applied correction.

The public demo uses raw NASA POWER wind data by default. The core library has an ERA5 monthly-history adapter for callers that deliberately retrieve and supply a reanalysis series. Automated CERRA correction is disabled because the former request did not create a defensible monthly climatology. See [Data sources](docs/DATA-SOURCES.md) and [Bias correction](docs/BIAS-CORRECTION.md).

## Wind farm designer

[Open the farm designer](https://windforge.khmer-iq.workers.dev/designer) or choose **Design farm layouts** after running a site analysis. The Caithness example opens with two hypothetical four-turbine layouts and a dated site-analysis snapshot. **Change site** opens a separate design and retrieves evidence for those coordinates.

Draw the shared parcel, place a receptor, then add or drag turbines. Duplicate a layout to keep a baseline while changing positions, hub height, turbine model or costs. The comparison shows absolute values or differences from any layout. Designs and their evidence are saved per site in this browser. **Check parcel constraints** overlays OpenStreetMap exclusion geometry for the drawn footprint and flags affected turbines. Site-point constraints are displayed separately.

The designer passes the edited coordinates to the core Jensen/Park wake and AEP models. IEA reference designs use published power and thrust tables. Commercial models use the existing illustrative library curves and sound levels. Receptor noise, astronomical shadow, LCOE and project NPV use the core environmental and financial models.

## Engineering workspace

[Open the engineering workspace](https://windforge.khmer-iq.workers.dev/engineering), or select **Investigate turbine fit** after a point analysis to carry its signed evidence into a comparison. Explore three IEA reference designs and their component records, compare counts and hub heights, supply a real parcel/receptor or deliberate cost and sound-power assumptions, and save/export versioned investigations. Missing wind, source, receptor or placement evidence remains explicit. A legacy commercial model name in the point analyser uses an illustrative curve; it is not a verified manufacturer power table.

The [knowledge service and recovery runbook](engineering/README.md) describes the source releases, self-hosted PostgreSQL/pgvector, CPU retrieval model, access controls, maintenance and tested backup route. The [engineering MCP tools](packages/mcp/README.md#engineering-workspace-tools) use the same live calculations and evidence as the browser.

## Quick start

Requirements: Node.js 22–24 and pnpm 9.

```bash
pnpm install
pnpm check
pnpm dev --filter @jamieblair/windforge-demo
```

The demo is then available at `http://localhost:3000`. Basic analysis needs no credentials.

### Cloudflare deployment

The public app runs on Cloudflare Workers at https://windforge.khmer-iq.workers.dev.
Run `pnpm deploy:cloudflare` from the repository root to build the workspace packages
and deploy the OpenNext Worker. See [Cloudflare deployment](docs/CLOUDFLARE.md) for
authentication, local preview, build settings and verification.

### TypeScript SDK

```ts
import { analyseSite } from '@jamieblair/windforge-core';

const result = await analyseSite({
  coordinate: { lat: 55.86, lng: -4.25 },
  hubHeightM: 100,
});

if (result.ok) {
  console.log(result.value.compositeScore); // number, or null if evidence is incomplete
  console.log(result.value.metadata.completeness);
}
```

### Candidate layout search

The core SDK also exposes `optimiseLayoutWithCandidates` for bounded, fixed-turbine-count
layout experiments. It searches a finite pool of locations, refines several feasible starts
with the existing wake model, and returns the best result alongside the original optimizer's
baseline. Counts are labelled exact or partial; the result is not a global energy optimum.
See [Candidate layout search](docs/CANDIDATE-LAYOUT-SEARCH.md) for usage, limits and the
reproducible `pnpm benchmark:layouts` comparison.

### MCP server

```json
{
  "mcpServers": {
    "windforge": {
      "command": "npx",
      "args": ["-y", "@jamieblair/windforge-mcp"]
    }
  }
}
```

The MCP server runs locally over stdio and exposes eleven tools in the current source checkout. See the [MCP setup guide](packages/mcp/README.md).

### Optional CDS access

`CDS_API_KEY` is server-side only. It is used by the current CDS health check and explicit ERA5 retrieval APIs; it does not make the default point analysis automatically bias-correct itself. Never prefix it with `NEXT_PUBLIC_` or expose it to browser code.

```dotenv
CDS_API_KEY=
```

Current CDS requests use the Climate Data Store retrieve-v1 job API. They can queue for minutes and are kept out of deterministic CI. Callers must review the dataset request and correction diagnostics before treating a corrected series as usable evidence.

## Model boundaries

- AEP is a Weibull/power-curve screening estimate with explicit loss assumptions. The displayed 10% and 20% downside cases are deterministic sensitivities, not P50/P75/P90 exceedance probabilities.
- Noise is simplified ISO 9613-2-style propagation for screening only, not an ETSU-R-97 compliance determination.
- Hourly wind can produce a labelled variability proxy; daily means produce no turbulence result. Extreme-wind helpers expose only a coarse return level of the mean-speed series. Neither path assigns an IEC class.
- Terrain flow and wake calculations are engineering approximations without site validation or microscale CFD.
- OpenStreetMap is contributed, incomplete data. Its protected-area tags are supplementary screening evidence, not an authoritative SSSI/SAC/SPA search.
- The UK map is a coarse, partial snapshot. Coverage and completion are displayed in the UI.

## Repository

```text
packages/
  core/    Domain types, data adapters, geometry, scoring, and models
  ui/      Reusable React components
  mcp/     Local stdio MCP server
  demo/    Next.js public application and heatmap worker
```

Useful documentation:

- [Architecture](docs/ARCHITECTURE.md)
- [API guide](docs/API.md)
- [Data sources](docs/DATA-SOURCES.md)
- [Bias correction](docs/BIAS-CORRECTION.md)
- [Heatmap pipeline](docs/HEATMAP.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Roadmap](ROADMAP.md)

`pnpm check` is the authoritative deterministic gate. It checks formatting, lint, TypeScript, all package tests, production builds, and the MCP publish tarball. CI also rejects high-severity production dependency advisories. Live-provider checks are separate because public APIs can be slow or unavailable.

## Licence and data attribution

Code is available under the [MIT License](LICENSE).

WindForge uses data from [NASA POWER](https://power.larc.nasa.gov/), [ECMWF/Copernicus ERA5](https://www.ecmwf.int/en/forecasts/dataset/ecmwf-reanalysis-v5), [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [Open-Elevation](https://open-elevation.com/), and Nominatim. Upstream datasets retain their own terms and attribution requirements.

The workspace uses a cropped WebP version of [Block Island offshore wind farm](https://commons.wikimedia.org/wiki/File:Block_Island_offshore_wind_farm_P6290638m.jpg) by Ionna22. The image and its adaptation are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Built and maintained by Jamie Blair.
