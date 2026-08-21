# @jamieblair/windforge-mcp

Local [Model Context Protocol](https://modelcontextprotocol.io) server for WindForge's screening-level wind-site tools.

The server runs over stdio, validates every tool input, and uses public NASA POWER, Open-Elevation, OpenStreetMap Overpass, and Nominatim data. It needs no credential for its default tools. Results are pre-feasibility evidence, not planning, statutory, IEC, acoustic, or bankability determinations.

## Install

```bash
npx -y @jamieblair/windforge-mcp
```

Or install a pinned development dependency:

```bash
pnpm add -D @jamieblair/windforge-mcp
```

The published binary is `windforge-mcp`.

## Configure an MCP client

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

This format works in clients that support local stdio MCP servers, including Claude Desktop and Cursor (consult the client's current documentation for its config-file location).

## Tools

| Tool | Purpose |
| --- | --- |
| `analyse_site` | Point screen with nullable composite, six factors, evidence completeness, flags, and provenance |
| `assess_site_polygon` | Sampled boundary screen with real constraint geometry, developable area, and optional indicative energy/layout |
| `calculate_aep` | Raw-NASA Weibull/power-curve AEP with losses and deterministic central/10%/20% downside sensitivities |
| `list_turbines` | Built-in turbine models and identifiers |
| `fetch_wind_history` | NASA POWER monthly wind history |
| `detect_constraints` | Supplementary OSM geometry and nearest-feature screening for a boundary |
| `ping` | Liveness heartbeat |

The server's `analyse_site` tool deliberately does not accept a CDS credential or start reanalysis jobs. This keeps secrets out of LLM tool arguments and matches the core's explicit reanalysis contract. Missing required evidence can suppress the composite score; clients should inspect `metadata.completeness` rather than assuming every successful tool call is complete.

## CLI

```bash
windforge-mcp --version
windforge-mcp --help
windforge-mcp
```

`LOG_LEVEL` may be `debug`, `info`, `warn`, or `error`. Logs go to stderr because stdout is reserved for the MCP protocol.

## Development and verification

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @jamieblair/windforge-mcp test
pnpm --filter @jamieblair/windforge-mcp build
pnpm --filter @jamieblair/windforge-mcp validate-publish
```

Optional live tests call public providers and can be slow or rate-limited:

```bash
pnpm --filter @jamieblair/windforge-mcp test:integration
```

Use `WINDFORGE_SKIP_LIVE=1` to retain only offline smoke coverage. Mocked tests establish tool and error behaviour; they are not scientific validation.

## Package boundary

- `src/server.ts` owns stdio lifecycle and validated dispatch.
- `src/tools/` contains one definition/handler per tool.
- Tool handlers convert domain failures to a uniform error envelope.
- Provider request details and screening calculations live in `@jamieblair/windforge-core`.

Licence: MIT. Source and security policy: https://github.com/weegienamja/WindForge
