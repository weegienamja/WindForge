# Contributing to WindForge

Contributions are welcome. WindForge prioritises traceable evidence and honest screening behaviour over feature count.

## Setup

Use Node.js 22–24 and pnpm 9.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm dev --filter @jamieblair/windforge-demo
```

`pnpm check` is the pre-merge gate and is the command run by CI. Live-provider tests are intentionally separate from deterministic CI:

```bash
pnpm --filter @jamieblair/windforge-mcp test:integration
```

Live tests use public infrastructure and may be rate-limited. They must not require a private credential for ordinary pull requests.

## Engineering rules

- Keep secrets and private provider calls on the server. Never introduce a confidential `NEXT_PUBLIC_*` variable.
- Use `Result<T, E>` at fallible domain/provider boundaries and validate untrusted HTTP or tool inputs.
- Missing evidence must remain missing; do not turn it into a neutral or favourable score.
- Include units in names such as `distanceKm`, `speedMs`, and `aepMwh`.
- Preserve WGS84 longitude/latitude ordering at GeoJSON boundaries and add geometry regression tests for spatial changes.
- Describe numerical assumptions and avoid compliance, certification, or statistical-probability language that the implementation cannot support.
- Add focused tests for behavioural changes. Mocked provider tests establish software behaviour, not scientific validation.
- Next.js route/page files may use framework-required default exports; reusable modules should prefer named exports.

## Pull requests

Keep changes cohesive, explain behavioural or scientific claim changes, and list the commands you ran. Do not include generated databases, credentials, local environment files, provider downloads, or build output.

For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
