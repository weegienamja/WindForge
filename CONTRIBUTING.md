# Contributing to WindForge

WindForge is a personal project. Contributions are welcome but not actively
solicited. If you do want to send a change, the rules below apply.

## Setup

```bash
pnpm install      # install workspace dependencies
pnpm test         # run all four packages' test suites
pnpm dev          # start the demo app on http://localhost:3000
pnpm check        # full pre-merge gate (typecheck + lint + tests + audits)
```

Node 20+ and pnpm 9+ are expected.

## What to contribute

Reasonable areas, in roughly the order they would land:

- New scoring factors (regulatory data, distance to coast, lightning density).
- Additional reanalysis sources for bias correction.
- Higher-resolution turbine library entries.
- Demo app UX or accessibility improvements.
- MCP tool refinements (better descriptions, fewer required args).

See "Suggested next extensions" in the technical specification for the long
form list. Out of scope: anything that requires a paid API key for the
default code path, anything that bundles a runtime backend, anything that
ships user authentication.

## Standards

These are non-negotiable:

- TypeScript strict, no `any`. Use `unknown` plus narrowing.
- Named exports only. No default exports.
- `Result<T, E>` for fallible operations. No thrown exceptions across
  module boundaries.
- Zod schemas at every external boundary (HTTP, CLI args, environment).
- Units in variable names: `distanceKm`, `speedMs`, `aepMwh`.
- Test per source file. Vitest. New code without tests will not be merged.
- No em dashes anywhere (code, comments, copy, docs, commit messages). The
  `pnpm audit:em-dashes` script enforces this.
- JSDoc on every public export.

`pnpm check` must pass before a PR is mergeable. CI mirrors this gate.

## Pull requests

- One concern per PR. Refactors and feature work do not share a branch.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`).
- Describe the test impact in the PR body. If existing tests changed, say
  why; if new tests were added, say what they cover.
