# @jamieblair/windforge-mcp

[Model Context Protocol](https://modelcontextprotocol.io) server that exposes the
[WindForge](https://github.com/weegienamja/WindForge) wind-turbine site-suitability engine to any
MCP-compatible LLM client (Claude Desktop, Cursor, Continue, custom agents).

The server runs over stdio and provides seven tools covering point analysis, parcel
assessment, energy yield, turbine library lookup, historical wind data, and constraint
detection. All scoring is local; the engine fetches its own data from public sources
(NASA POWER, Open-Elevation, OpenStreetMap Overpass, optionally Copernicus ERA5 / CERRA).

## Install

No install needed; run with `npx`:

```bash
npx -y @jamieblair/windforge-mcp
```

Or pin it as a dev dependency in your own project:

```bash
pnpm add -D @jamieblair/windforge-mcp
```

The published binary is `windforge-mcp`.

## Quick start

### Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config):

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

Restart Claude Desktop. You should see seven WindForge tools in the tool picker.

To enable ERA5 / CERRA reanalysis bias-correction (recommended for production use),
add a `CDS_API_KEY` from [cds.climate.copernicus.eu](https://cds.climate.copernicus.eu/):

```json
{
  "mcpServers": {
    "windforge": {
      "command": "npx",
      "args": ["-y", "@jamieblair/windforge-mcp"],
      "env": {
        "CDS_API_KEY": "your-key-here"
      }
    }
  }
}
```

### Cursor

Cursor reads from `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-workspace):

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

### Continue / generic clients

Any MCP client that speaks the stdio transport will work. Point it at `npx -y
@jamieblair/windforge-mcp` and the seven tools will be advertised through `tools/list`.

## Tools

| Tool | Latency | Inputs | Returns |
|------|---------|--------|---------|
| `analyse_site` | 5-90s | `lat`, `lng`, optional hub height, weights, CDS key | Composite 0-100 score, six factor scores, hard constraints, metadata |
| `assess_site_polygon` | 30s-3min | Polygon vertices, optional turbine, grid spacing, weights | Sample grid, aggregated score, full constraint report, optional energy yield |
| `calculate_aep` | 5-10s | `lat`, `lng`, `turbineId`, optional hub height, count | Gross/net AEP, capacity factor, P50/P75/P90 scenarios, monthly breakdown |
| `list_turbines` | instant | (none) | Built-in turbine library with ids, manufacturer, rated power, hub heights |
| `fetch_wind_history` | 1-3s | `lat`, `lng`, optional `years` (1-40) | NASA POWER monthly wind speeds at 2m, 10m, 50m, plus directions |
| `detect_constraints` | 5-20s | Polygon vertices, optional name | Hard / soft / info constraint report and nearest-receptor distances |
| `ping` | instant | (none) | Liveness heartbeat |

Tool descriptions advertised through `tools/list` are tuned for LLM tool-selection;
the LLM gets enough context to pick `analyse_site` for a single coordinate vs
`assess_site_polygon` for a real parcel.

## CLI

```bash
windforge-mcp --version    # print version and exit
windforge-mcp --help       # print usage, env vars, and tool list
windforge-mcp              # run the MCP server over stdio
```

### Environment variables

| Var | Purpose |
|-----|---------|
| `CDS_API_KEY` | Copernicus CDS API key. When set, ERA5 (and CERRA in Europe) bias-correct NASA POWER and lift wind-resource confidence to high. |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error`. Default `info`. Logs are written to stderr (stdout is reserved for the MCP protocol). |

## Development

```bash
pnpm install            # at repo root
pnpm --filter @jamieblair/windforge-mcp build
pnpm --filter @jamieblair/windforge-mcp dev    # tsx watch
pnpm --filter @jamieblair/windforge-mcp test   # 69 unit + e2e tests
```

### Integration tests (slow, real APIs)

```bash
pnpm --filter @jamieblair/windforge-mcp test:integration
```

These tests call the real core engine which hits live external APIs:

- NASA POWER (free, public, ~1-3s per call, cached aggressively)
- Open-Elevation (free, public, ~1s per call)
- OpenStreetMap Overpass (free, public, 5-20s per call, rate-limited; tests can fail if Overpass is degraded)
- ERA5 / CERRA via Copernicus CDS (free with API key, only invoked when `CDS_API_KEY` is set)

They consume real upstream quota and can take 30+ seconds. Skip the live half with
`WINDFORGE_SKIP_LIVE=1` to keep only the offline `list_turbines` smoke test:

```bash
WINDFORGE_SKIP_LIVE=1 pnpm --filter @jamieblair/windforge-mcp test:integration
```

The integration suite is not part of the default `pnpm test` gate. Run it manually
before publishing or when changing tool wiring.

## Architecture

- `src/server.ts`: stdio server, lifecycle, CLI flags
- `src/tools/`: one file per tool plus shared zod fragments
- `src/zod-to-json-schema.ts`: in-tree converter (no runtime dependency on the npm package)
- `src/logger.ts`: stderr-only structured JSON logger

All tool inputs are validated by zod before reaching core. All errors are translated
into a uniform `{ error: { code, message } }` envelope. Tool handlers never throw past
the MCP boundary.

## Licence

MIT. See repository root.
