# Pre-publish checklist

Before tagging a release of `@jamieblair/windforge-core`, `@jamieblair/windforge`,
or `@jamieblair/windforge-mcp`, walk through every item below. Items marked
**manual** cannot be enforced by CI and require a human eye.

The numeric gates assume a clean clone, `pnpm install`, and Node 20+.

## 1. Automated gates

- [ ] `pnpm -r typecheck` passes with zero errors.
- [ ] `pnpm lint` passes with zero diagnostics across all packages.
- [ ] `pnpm -r test` reports the headline test count, zero failures, zero skips.
- [ ] `pnpm -r build` produces clean `dist/` output for `core`, `ui`, and
      `mcp` with no warnings.
- [ ] `pnpm audit:em-dashes` exits zero (no U+2014 in source or docs).
- [ ] `pnpm --filter @jamieblair/windforge-demo verify-build` exits zero
      (production Next build clean of warnings outside the allowlist).
- [ ] `pnpm --filter @jamieblair/windforge-mcp validate-publish` exits zero
      (tarball under 50KB, contents and metadata sane, README intact).

## 2. Demo app: live data smoke runs (manual)

Before running the analyse-page checks below, hit `/api/health` to confirm
every upstream is alive:

```bash
curl localhost:3000/api/health | jq
```

If any source is `fail`, fix that before proceeding. Latency is informational
only; CDS will report `fail: CDS_API_KEY not set; skipped` unless the key is
in your environment.

For each of the runs below, capture the analyse page and attach the screenshot
to the release PR.

- [ ] **Glasgow (55.86, -4.25), 100m hub, Vestas V90-2.0**: composite score is
      between 50 and 75, six factor bars all render, monthly history chart
      shows 1981 to current year, no console errors in DevTools.
- [ ] **Durness (58.21, -5.03), 120m hub, Vestas V110-2.0**: composite score is
      higher than the Glasgow run, bias-correction badge is present, eyebrow on
      the history chart reads "Bias-corrected history" (CERRA reference).
- [ ] **Central London (51.51, -0.13), 80m hub, Enercon E-44**: at least one
      hard constraint is flagged ("This site is unlikely to be developable
      without resolving these."), composite score is below 40.

## 3. Mobile + accessibility (manual)

- [ ] Open the analyse page at 375×812 and confirm the mobile fallback panel
      renders (`text-only analysis`), and the desktop topbar/map are not in the
      DOM.
- [ ] Lighthouse run against the deployed landing page, mobile preset:
  - [ ] Performance ≥ 90
  - [ ] Accessibility ≥ 95
  - [ ] Best Practices ≥ 95
  - [ ] SEO ≥ 95
- [ ] CLS measured by Lighthouse is 0 on both landing and analyse routes.

## 4. MCP integration (manual)

- [ ] In Claude Desktop with `@jamieblair/windforge-mcp` registered, ask:
      "Score a wind site at 55.86, -4.25 with a 100m hub". The reply must
      include all six factors and a composite score.
- [ ] Ask Claude to "list available turbines"; confirm at least 5 turbine
      models are returned.
- [ ] Ask Claude to "fetch wind history for 58.21, -5.03 from 2010 to 2024"
      and confirm a monthly record set comes back.

## 5. SEO and presentation (manual)

- [ ] Open `/opengraph-image` directly and confirm the 1200×630 image renders
      with the headline "Wind site suitability, computed.", an eyebrow, the
      mono row, and the bottom bar.
- [ ] Twitter / X / LinkedIn URL preview of `https://wind.jamieblair.co.uk`
      shows the OG image, the WindForge title, and the metadata description.
- [ ] All footer links resolve (GitHub, npm core, npm mcp, issues, jamieblair.co.uk,
      data source pages).

## 6. Console hygiene (manual)

- [ ] Loading the landing page produces zero browser console errors and zero
      React warnings.
- [ ] Running an analysis on the analyse page produces zero browser console
      errors. `act()` warnings from test runs are ignored here.

## 7. Final gates

- [ ] `CHANGELOG.md` updated with the new version, dated, and grouped into
      Added / Changed / Fixed sections.
- [ ] Version bumped consistently across `packages/core/package.json`,
      `packages/ui/package.json`, `packages/mcp/package.json`, and
      `packages/demo/package.json`.
- [ ] Tag pushed only after every box above is checked.

> Anything in this file marked **manual** cannot be replaced by CI without
> sacrificing signal. Do not skip them. The point of this checklist is to
> close the gap between "the code compiles" and "the product works".
